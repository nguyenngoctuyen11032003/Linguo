-- Linguo spec 9 §3: exam practice ("Bài luyện mô phỏng", TOPIK I/II and CEFR mock forms).
-- Forms and their questions, private answer keys, learner attempts and answers, the content import and
-- the exam RPCs. JSON shapes match packages/shared/src/exam/contract.ts; the bundle shape matches
-- packages/shared/src/exam/bundle.ts examBundleSchema.
--
-- Clients read published forms (RLS) and their own attempts/answers (RLS select-own). Questions and
-- keys grant nothing to anon/authenticated: questions are served only by the SECURITY DEFINER RPCs
-- below, and the answer, explanation, listening script, rubric and sample answer only appear in a
-- result, i.e. once the attempt is closed (submitted or expired).
--
-- ---------------------------------------------------------------------------
-- Bundle (content_private.import_exam_bundle / public.import_exam_content_bundle)
-- ---------------------------------------------------------------------------
-- Built by scripts/content-import.mjs from content/exams/<en|ko>/<form>.yaml. Ids are UUIDv5 under
-- CONTENT_UUID_NAMESPACE (packages/shared/src/content/bundle.ts) of the form and question keys.
-- content_hash (sha256 hex, review fields excluded); a form's hash folds in its questions' hashes, so
-- any question edit changes it, and a changed form hash bumps the form version. Every bundled form is
-- imported as published. mcq option ids are opaque (`o` + 8 hex, shuffled by the build).
--
-- {
--   "bundle_version": 1,
--   "forms": [{
--     "id": uuid, "key": "ko:exam:topik-i-mock-1", "language_code": "en" | "ko",
--     "family": "topik_i" | "topik_ii" | "cefr",
--     "title_vi": text, "description_vi": text, "level_from": text, "level_to": text,
--     "source_key": "src:linguo-demo",                 -- public.content_sources.key (lesson bundle)
--     "time_limits": {"listening": 15, "reading": 25}, -- minutes per section
--     "scoring": {"verified": bool, "source_note_vi": text, "section_max": {...}, "bands": [...], "pass_ratio": num | null},
--     "is_demo": bool, "content_hash": "<64 hex>", "reviewed_by": text | null, "reviewed_at": iso | null,
--     "questions": [{
--       "id": uuid, "key": text, "seq": 1,                 -- seq: 1-based position within the form
--       "section": "listening" | "reading" | "writing", "kind": "mcq" | "short_text" | "essay",
--       "question_type": text, "level_code": text, "points": int,
--       "prompt": {"instruction_vi", "stem", "stem_lang", "passage"?, "audio_asset_id": text | null,
--                  "options"?: [{"id", "text", "lang"}], "min_chars"?, "max_chars"?},   -- never "script"
--       "answer": "o1a2b3c4d" (mcq) | ["accepted", ...] (short_text) | null (essay),
--       "explanation": {"vi": text},
--       "script": text | null,                 -- listening script (TTS text when audio_asset_id is null)
--       "rubric": [{"key", "label_vi", "description_vi", "max_points"}] | null,   -- essay only
--       "sample_answer": text | null,
--       "content_hash": "<64 hex>"             -- folded into the form hash; not stored
--     }]
--   }]
-- }
-- Returns {inserted, updated, archived, unchanged} (integers, forms and questions together), like the
-- lesson and diagnostic imports.

-- ---------------------------------------------------------------------------
-- Forms (public, published rows readable by authenticated users)
-- ---------------------------------------------------------------------------
create table public.exam_forms (
  -- UUIDv5 of key under CONTENT_UUID_NAMESPACE.
  id uuid primary key,
  key text not null unique,
  language_code text not null check (language_code in ('en', 'ko')),
  family text not null check (family in ('topik_i', 'topik_ii', 'cefr')),
  title_vi text not null check (char_length(title_vi) between 1 and 120),
  description_vi text not null check (char_length(description_vi) between 1 and 500),
  level_from text not null,
  level_to text not null,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  -- Minutes per section: {"listening": 15, "reading": 25}.
  time_limits jsonb not null check (jsonb_typeof(time_limits) = 'object'),
  -- examScoringSchema (contract.ts): versioned data, never hard-coded.
  scoring jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_forms_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null),
  constraint exam_forms_family_language check ((family = 'cefr') = (language_code = 'en')),
  constraint exam_forms_level_from_fk foreign key (language_code, level_from)
    references public.level_reference_hours (language_code, level_code),
  constraint exam_forms_level_to_fk foreign key (language_code, level_to)
    references public.level_reference_hours (language_code, level_code),
  constraint exam_forms_scoring_shape check (
    jsonb_typeof(scoring) = 'object'
    and jsonb_typeof(scoring -> 'verified') = 'boolean'
    and jsonb_typeof(scoring -> 'source_note_vi') = 'string'
    and jsonb_typeof(scoring -> 'section_max') = 'object'
    and jsonb_typeof(scoring -> 'bands') = 'array'
    and jsonb_typeof(scoring -> 'pass_ratio') in ('number', 'null')
  )
);

create index exam_forms_language_idx on public.exam_forms (language_code, family) where status = 'published';
create index exam_forms_source_id_idx on public.exam_forms (source_id);

comment on table public.exam_forms is 'Exam practice forms ("Bài luyện mô phỏng", never official papers). Published rows readable by authenticated users.';

create trigger exam_forms_set_updated_at
  before update on public.exam_forms
  for each row execute function public.set_updated_at();
-- Same status workflow as the lesson content (content migration).
create trigger exam_forms_status_transition
  before update on public.exam_forms
  for each row execute function public.content_status_transition();

-- ---------------------------------------------------------------------------
-- Questions (no client grants: served only by the RPCs)
-- ---------------------------------------------------------------------------
create table public.exam_questions (
  -- UUIDv5 of key under CONTENT_UUID_NAMESPACE.
  id uuid primary key,
  key text not null unique,
  form_id uuid not null references public.exam_forms (id) on delete restrict,
  seq integer not null check (seq >= 1),
  section text not null check (section in ('listening', 'reading', 'writing')),
  kind text not null check (kind in ('mcq', 'short_text', 'essay')),
  question_type text not null check (question_type ~ '^[a-z0-9_]{3,48}$'),
  level_code text not null,
  points integer not null check (points between 1 and 50),
  -- Public part (examServedQuestionSchema.prompt minus tts_text). Never holds the script or the answer.
  prompt jsonb not null,
  -- Questions removed from their file are archived, never deleted (attempts keep referring to them).
  status text not null default 'published' check (status in ('published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_questions_prompt_shape check (
    jsonb_typeof(prompt) = 'object'
    and jsonb_typeof(prompt -> 'instruction_vi') = 'string'
    and jsonb_typeof(prompt -> 'stem') = 'string'
    and not (prompt ?| array['script', 'answer', 'explanation', 'rubric', 'sample_answer', 'tts_text'])
  ),
  constraint exam_questions_mcq_options check (kind <> 'mcq' or jsonb_typeof(prompt -> 'options') = 'array')
);

create index exam_questions_form_seq_idx on public.exam_questions (form_id, seq) where status = 'published';
create index exam_questions_type_idx on public.exam_questions (question_type) where status = 'published';

comment on table public.exam_questions is 'Exam questions (public prompt only). No client grants; served only by the exam RPCs.';

create trigger exam_questions_set_updated_at
  before update on public.exam_questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keys (content_private: never granted)
-- ---------------------------------------------------------------------------
create table content_private.exam_keys (
  question_id uuid primary key references public.exam_questions (id) on delete cascade,
  -- mcq: "a" (option id); short_text: ["accepted", ...]; essay: null.
  answer jsonb check (answer is null or jsonb_typeof(answer) in ('string', 'array')),
  explanation jsonb not null check (jsonb_typeof(explanation -> 'vi') = 'string'),
  script text,
  rubric jsonb check (rubric is null or jsonb_typeof(rubric) = 'array'),
  sample_answer text,
  updated_at timestamptz not null default now()
);

comment on table content_private.exam_keys is 'Answers, explanations, listening scripts, rubrics and sample answers of exam questions.';

-- ---------------------------------------------------------------------------
-- Attempts (learner-visible through RLS, written only by RPCs)
-- ---------------------------------------------------------------------------
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  form_id uuid not null references public.exam_forms (id) on delete restrict,
  -- exam_forms.version when the attempt started.
  content_version integer not null check (content_version >= 1),
  mode text not null check (mode in ('full', 'section', 'question_type')),
  section text check (section in ('listening', 'reading', 'writing')),
  question_type text,
  -- Served order, fixed at start (a question_type drill may span several forms of the family).
  question_ids uuid[] not null check (cardinality(question_ids) between 1 and 200),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  started_at timestamptz not null default now(),
  -- null = untimed (section / question_type practice).
  deadline_at timestamptz,
  submitted_at timestamptz,
  -- examResultSchema (contract.ts), written when the attempt closes.
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  constraint exam_attempts_closed_shape check ((status = 'in_progress') = (submitted_at is null and result is null)),
  constraint exam_attempts_section_mode check (mode <> 'section' or section is not null),
  constraint exam_attempts_question_type_mode check ((mode = 'question_type') = (question_type is not null)),
  constraint exam_attempts_deadline_full check (deadline_at is null or mode = 'full')
);

-- One in-progress attempt per (user, path); starting another closes the open one as expired.
create unique index exam_attempts_one_in_progress on public.exam_attempts (user_id, learning_path_id) where status = 'in_progress';
create index exam_attempts_path_started_idx on public.exam_attempts (learning_path_id, started_at desc);
create index exam_attempts_user_started_idx on public.exam_attempts (user_id, started_at desc);
create index exam_attempts_form_id_idx on public.exam_attempts (form_id);

comment on table public.exam_attempts is 'Exam practice attempts. Learners read their own rows; written only by the exam RPCs.';

-- ---------------------------------------------------------------------------
-- Answers (learner-visible through RLS, written only by save_exam_answer)
-- ---------------------------------------------------------------------------
create table public.exam_answers (
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.exam_questions (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Option id (mcq) or text; null = cleared.
  answer text check (char_length(answer) <= 5000),
  flagged boolean not null default false,
  -- Key and payload of the latest save of this question (replays return replayed: true).
  idempotency_key uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create unique index exam_answers_idempotency_idx on public.exam_answers (user_id, idempotency_key);
create index exam_answers_question_id_idx on public.exam_answers (question_id);

comment on table public.exam_answers is 'Saved exam answers. Learners read their own rows; written only by save_exam_answer.';

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.exam_forms enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table content_private.exam_keys enable row level security;

create policy "exam forms: read published" on public.exam_forms
  for select to authenticated using (status = 'published');
-- exam_questions, content_private.exam_keys: no policy, no grant (server-only).
create policy "exam attempts: read own" on public.exam_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "exam answers: read own" on public.exam_answers
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.exam_forms, public.exam_questions, public.exam_attempts, public.exam_answers
  from public, anon, authenticated;
revoke all on content_private.exam_keys from public, anon, authenticated;
grant select on public.exam_forms, public.exam_attempts, public.exam_answers to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients; scalar arguments only, so PostgREST and the type
-- generator never expose them as computed columns).
-- ---------------------------------------------------------------------------

-- Shared short_text normalisation (mirror of packages/shared/src/exam/grading.ts normalizeExamText):
-- Unicode NFC -> trim -> collapse whitespace runs to one space -> strip trailing . ? ! , ; : 。 、 …
-- (no re-trim afterwards: "좋아요 ." stays "좋아요 ") -> lower-case under pg_c_utf8 (locale-independent).
-- Whitespace is EXAM_WHITESPACE of grading.ts, mapped to U+0020 first so btrim/collapse only see spaces.
-- Checked case for case against packages/shared/src/exam/grading.fixtures.json by exams.test.sql.
create or replace function public.exam_normalize_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text collate pg_catalog.pg_c_utf8;
  -- SPACE, TAB LF VT FF CR, NO-BREAK SPACE, IDEOGRAPHIC SPACE.
  v_ws constant text := chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160) || chr(12288);
begin
  if p_text is null then
    return null;
  end if;
  v := normalize(p_text, nfc);
  v := translate(v, v_ws, repeat(' ', char_length(v_ws)));
  v := btrim(v, ' ');
  v := regexp_replace(v, ' {2,}', ' ', 'g');
  v := regexp_replace(v, '[.?!,;:。、…]+$', '');
  return lower(v);
end;
$$;

-- PRD §9.2 warning when the form's structure does not match the path goal.
create or replace function public.exam_structure_warning(p_goal_type text, p_family text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_goal_type = 'topik_ii' and p_family = 'topik_i' then
      'Đề này theo cấu trúc TOPIK I, khác mục tiêu TOPIK II của lộ trình. Kết quả chỉ để tham khảo.'
    when p_goal_type = 'topik_i' and p_family = 'topik_ii' then
      'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.'
    when p_goal_type = 'cefr' and p_family <> 'cefr' then
      'Đề này không theo khung CEFR, khác mục tiêu CEFR của lộ trình. Kết quả chỉ để tham khảo.'
  end;
$$;

-- Prompt as served during an attempt: the stored public prompt (nulls dropped, audio_asset_id kept)
-- plus tts_text = the listening script when there is no recording. Never contains `script`.
create or replace function public.exam_served_prompt(p_prompt jsonb, p_script text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(p_prompt - 'audio_asset_id' - 'script' - 'tts_text')
    || jsonb_build_object('audio_asset_id', case when jsonb_typeof(p_prompt -> 'audio_asset_id') = 'string' then p_prompt -> 'audio_asset_id' end)
    || case when p_script is not null and jsonb_typeof(p_prompt -> 'audio_asset_id') is distinct from 'string'
         then jsonb_build_object('tts_text', p_script) else '{}'::jsonb end;
$$;

-- True once an attempt is past its deadline plus the grace period (EXAM_DEADLINE_GRACE_SEC = 30).
create or replace function public.exam_overdue(p_deadline_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_deadline_at is not null and now() > p_deadline_at + interval '30 seconds';
$$;

-- examAttemptSchema of an in-progress attempt (saved answers included, no keys).
create or replace function public.exam_attempt_json(p_attempt_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id', a.id,
    'form_id', a.form_id,
    'form_title_vi', f.title_vi,
    'family', f.family,
    'mode', a.mode,
    'section', a.section,
    'question_type', a.question_type,
    'status', a.status,
    'started_at', a.started_at,
    'deadline_at', a.deadline_at,
    'server_now', now(),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'question_id', q.id,
          'seq', u.ord,
          'section', q.section,
          'kind', q.kind,
          'question_type', q.question_type,
          'points', q.points,
          'prompt', public.exam_served_prompt(q.prompt, k.script),
          'answer', ans.answer,
          'flagged', coalesce(ans.flagged, false)
        ) order by u.ord)
      from unnest(a.question_ids) with ordinality as u(qid, ord)
      join public.exam_questions q on q.id = u.qid
      left join content_private.exam_keys k on k.question_id = q.id
      left join public.exam_answers ans on ans.attempt_id = a.id and ans.question_id = q.id
    ), '[]'::jsonb),
    'structure_warning_vi', public.exam_structure_warning(p.goal_type, f.family)
  )
  from public.exam_attempts a
  join public.exam_forms f on f.id = a.form_id
  join public.learning_paths p on p.id = a.learning_path_id
  where a.id = p_attempt_id;
$$;

-- examResultSchema of an attempt graded now (status/submitted_at given by the caller).
--   mcq: answer = option id; short_text: exam_normalize_text equal to any accepted answer; essay: not
--   graded (is_correct null) and excluded from total/max, by_section/by_question_type max and counts.
--   TOPIK full mock: by_section.scaled = points / (max + essay points) × section_max, rounded to 0.1, so
--   an ungraded essay counts as 0 (the TOPIK II writing section only adds its short_text points);
--   estimated_level = highest band with min_total <= Σ scaled. CEFR (full/section): reached per section
--   with auto-graded points at points / max >= pass_ratio. Drills (question_type) get neither.
create or replace function public.exam_build_result(p_attempt_id uuid, p_status text, p_submitted_at timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_att public.exam_attempts;
  v_form public.exam_forms;
  v_review jsonb;
  v_by_section jsonb;
  v_by_type jsonb;
  v_topik_full boolean;
  v_scaled_total numeric;
  v_has_essay boolean;
  v_level text;
  v_estimated jsonb;
  v_cefr jsonb;
  v_total numeric;
  v_max numeric;
begin
  select a.* into v_att from public.exam_attempts a where a.id = p_attempt_id;
  select f.* into v_form from public.exam_forms f where f.id = v_att.form_id;
  v_topik_full := v_form.family in ('topik_i', 'topik_ii') and v_att.mode = 'full';

  select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', g.id,
      'seq', g.ord,
      'section', g.section,
      'kind', g.kind,
      'question_type', g.question_type,
      'points', g.points,
      'prompt', public.exam_served_prompt(g.prompt, g.script)
        || case when g.script is not null then jsonb_build_object('script', g.script) else '{}'::jsonb end,
      'answer', g.answer,
      'is_correct', g.is_correct,
      'correct_answer', case g.kind when 'mcq' then g.key_answer #>> '{}' when 'short_text' then g.key_answer ->> 0 end,
      'explanation', g.explanation,
      'rubric', g.rubric,
      'sample_answer', g.sample_answer
    ) order by g.ord), '[]'::jsonb)
  into v_review
  from (
    select q.id, u.ord, q.section, q.kind, q.question_type, q.points, q.prompt, k.script, ans.answer,
           k.answer as key_answer, k.explanation, k.rubric, k.sample_answer,
           case q.kind
             when 'essay' then null
             when 'mcq' then coalesce(ans.answer = (k.answer #>> '{}'), false)
             else coalesce(ans.answer is not null and exists (
               select 1 from jsonb_array_elements_text(case when jsonb_typeof(k.answer) = 'array' then k.answer else '[]'::jsonb end) as acc(t)
               where public.exam_normalize_text(ans.answer) <> ''
                 and public.exam_normalize_text(acc.t) = public.exam_normalize_text(ans.answer)
             ), false)
           end as is_correct
    from unnest(v_att.question_ids) with ordinality as u(qid, ord)
    join public.exam_questions q on q.id = u.qid
    left join content_private.exam_keys k on k.question_id = q.id
    left join public.exam_answers ans on ans.attempt_id = v_att.id and ans.question_id = q.id
  ) as g;

  with r as (
    select e ->> 'section' as section, e ->> 'kind' as kind, (e ->> 'points')::numeric as pts,
           coalesce((e ->> 'is_correct')::boolean, false) as ok
    from jsonb_array_elements(v_review) as e
  ), s as (
    select r.section,
           sum(case when r.ok then r.pts else 0 end) as points,
           sum(case when r.kind <> 'essay' then r.pts else 0 end) as max,
           sum(case when r.kind = 'essay' then r.pts else 0 end) as essay_points,
           count(*) filter (where r.ok) as correct,
           count(*) filter (where r.kind <> 'essay') as total
    from r group by r.section
  ), sc as (
    select s.*,
           case when v_topik_full and jsonb_typeof(v_form.scoring -> 'section_max' -> s.section) = 'number' then
             round(coalesce(s.points / nullif(s.max + s.essay_points, 0), 0) * (v_form.scoring -> 'section_max' ->> s.section)::numeric, 1)
           end as scaled
    from s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'section', sc.section, 'points', sc.points, 'max', sc.max, 'correct', sc.correct, 'total', sc.total,
           'scaled', sc.scaled
         ) order by array_position(array['listening', 'reading', 'writing'], sc.section)), '[]'::jsonb),
         coalesce(sum(sc.points), 0), coalesce(sum(sc.max), 0), sum(sc.scaled),
         coalesce(sum(sc.essay_points) > 0, false),
         case when v_form.family = 'cefr' and v_att.mode <> 'question_type'
                   and jsonb_typeof(v_form.scoring -> 'pass_ratio') = 'number' then
           coalesce(jsonb_agg(jsonb_build_object(
               'section', sc.section, 'level_code', v_form.level_to,
               'reached', sc.points / sc.max >= (v_form.scoring ->> 'pass_ratio')::numeric
             ) order by array_position(array['listening', 'reading', 'writing'], sc.section))
             filter (where sc.max > 0), '[]'::jsonb)
         end
  into v_by_section, v_total, v_max, v_scaled_total, v_has_essay, v_cefr
  from sc;

  select coalesce(jsonb_agg(jsonb_build_object(
           'question_type', t.question_type, 'section', t.section, 'points', t.points, 'max', t.max,
           'correct', t.correct, 'total', t.total
         ) order by array_position(array['listening', 'reading', 'writing'], t.section), t.question_type), '[]'::jsonb)
  into v_by_type
  from (
    select e ->> 'question_type' as question_type, e ->> 'section' as section,
           sum(case when coalesce((e ->> 'is_correct')::boolean, false) then (e ->> 'points')::numeric else 0 end) as points,
           sum((e ->> 'points')::numeric) as max,
           count(*) filter (where coalesce((e ->> 'is_correct')::boolean, false)) as correct,
           count(*) as total
    from jsonb_array_elements(v_review) as e
    where e ->> 'kind' <> 'essay'
    group by 1, 2
  ) as t;

  if v_topik_full and jsonb_array_length(v_form.scoring -> 'bands') > 0 then
    v_scaled_total := round(coalesce(v_scaled_total, 0), 1);
    select b ->> 'level_code' into v_level
    from jsonb_array_elements(v_form.scoring -> 'bands') as b
    where (b ->> 'min_total')::numeric <= v_scaled_total
    order by (b ->> 'min_total')::numeric desc
    limit 1;
    v_estimated := jsonb_build_object(
      'level_code', v_level,
      'scaled_total', v_scaled_total,
      'label_vi', case when v_level is null then 'Chưa đạt bậc thấp nhất. ' else '' end
        || 'Quy đổi tham khảo, không phải kết quả chính thức.'
        || case when v_has_essay then ' Phần viết luận chưa tính điểm.' else '' end
    );
  end if;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'form_id', v_att.form_id,
    'form_title_vi', v_form.title_vi,
    'family', v_form.family,
    'mode', v_att.mode,
    'status', p_status,
    'started_at', v_att.started_at,
    'submitted_at', p_submitted_at,
    'total', v_total,
    'max', v_max,
    'by_section', v_by_section,
    'by_question_type', v_by_type,
    'estimated_level', v_estimated,
    'cefr_sections', v_cefr,
    'scoring_verified', coalesce((v_form.scoring ->> 'verified')::boolean, false),
    'scoring_source_vi', coalesce(v_form.scoring ->> 'source_note_vi', ''),
    'review', v_review
  );
end;
$$;

-- Grades and closes an in-progress attempt as 'submitted' or 'expired'; returns the stored result.
create or replace function public.exam_close_attempt(p_attempt_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.exam_build_result(p_attempt_id, p_status, now());
  update public.exam_attempts
  set status = p_status, submitted_at = now(), result = v_result
  where id = p_attempt_id and status = 'in_progress';
  -- TODO(spec8-merge): add this attempt to public.activity_days (Spec 8) for the attempt's user and
  -- path on the local day of now(): answers += number of non-null exam_answers of the attempt, and
  -- active_ms += Σ over consecutive saves (exam_answers.updated_at ordered, starting at started_at) of
  -- least(gap, 120 s). No XP for exam practice (spec §3). public.activity_days does not exist on the
  -- base branch of this migration, so the orchestrator wires it when merging Spec 8.
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- examFormSummarySchema[] of the published forms of a language (empty for an unknown language).
create or replace function public.list_exam_forms(p_language text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'form_id', f.id,
        'key', f.key,
        'language_code', f.language_code,
        'family', f.family,
        'title_vi', f.title_vi,
        'description_vi', f.description_vi,
        'level_from', f.level_from,
        'level_to', f.level_to,
        'is_demo', f.is_demo,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
              'section', s.section, 'question_count', s.n,
              'minutes', case when jsonb_typeof(f.time_limits -> s.section) = 'number' then (f.time_limits ->> s.section)::integer end
            ) order by array_position(array['listening', 'reading', 'writing'], s.section))
          from (
            select q.section, count(*) as n from public.exam_questions q
            where q.form_id = f.id and q.status = 'published' group by q.section
          ) as s
        ), '[]'::jsonb),
        'question_types', coalesce((
          select jsonb_agg(jsonb_build_object('question_type', t.question_type, 'section', t.section, 'count', t.n)
            order by array_position(array['listening', 'reading', 'writing'], t.section), t.question_type)
          from (
            select q.question_type, q.section, count(*) as n from public.exam_questions q
            where q.form_id = f.id and q.status = 'published' group by q.question_type, q.section
          ) as t
        ), '[]'::jsonb),
        'scoring_verified', coalesce((f.scoring ->> 'verified')::boolean, false),
        'last_attempt', (
          select jsonb_build_object('attempt_id', a.id, 'submitted_at', a.submitted_at,
                                    'total', a.result -> 'total', 'max', a.result -> 'max')
          from public.exam_attempts a
          where a.user_id = v_uid and a.form_id = f.id and a.status <> 'in_progress'
          order by a.submitted_at desc, a.id
          limit 1
        )
      ) order by array_position(array['topik_i', 'topik_ii', 'cefr'], f.family), f.key)
    from public.exam_forms f
    where f.language_code = p_language and f.status = 'published'
      and exists (select 1 from public.exam_questions q where q.form_id = f.id and q.status = 'published')
  ), '[]'::jsonb);
end;
$$;

-- Starts an attempt (examAttemptSchema). An open attempt of the path with the same form, mode, section
-- and question type is resumed as is (double clicks, reloads); any other open attempt is graded and
-- closed as expired first. Rate limit: 10 new attempts per user per hour.
create or replace function public.start_exam(
  p_path_id uuid, p_form_id uuid, p_mode text, p_section text default null, p_question_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path public.learning_paths;
  v_form public.exam_forms;
  v_open public.exam_attempts;
  v_ids uuid[];
  v_section text;
  v_minutes integer;
  v_id uuid;
  v_qt text := case when p_mode = 'question_type' then p_question_type end;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  -- Serialises starts of one user (rate limit, one open attempt per path).
  perform 1 from public.profiles where id = v_uid for update;
  select p.* into v_path from public.learning_paths p
  where p.id = p_path_id and p.user_id = v_uid and p.status <> 'archived';
  if not found then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  select f.* into v_form from public.exam_forms f where f.id = p_form_id and f.status = 'published';
  if not found then
    raise exception using errcode = 'P0001', message = 'form_not_found';
  end if;
  if v_form.language_code <> v_path.language_code then
    raise exception using errcode = 'P0001', message = 'language_mismatch';
  end if;
  if p_mode is null or p_mode not in ('full', 'section', 'question_type')
     or (p_mode = 'section' and (p_section is null or p_section not in ('listening', 'reading', 'writing')))
     or (p_mode = 'question_type' and p_question_type is null) then
    raise exception using errcode = 'P0001', message = 'invalid_mode';
  end if;

  select a.* into v_open from public.exam_attempts a
  where a.user_id = v_uid and a.learning_path_id = p_path_id and a.status = 'in_progress' for update;
  if found then
    if not public.exam_overdue(v_open.deadline_at)
       and v_open.form_id = p_form_id and v_open.mode = p_mode
       and (p_mode <> 'section' or v_open.section = p_section)
       and v_open.question_type is not distinct from v_qt then
      return public.exam_attempt_json(v_open.id);
    end if;
    perform public.exam_close_attempt(v_open.id, 'expired');
  end if;

  if (select count(*) from public.exam_attempts a where a.user_id = v_uid and a.started_at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if p_mode = 'question_type' then
    -- Up to EXAM_DRILL_SIZE (10) questions of the type across every published form of the family:
    -- never answered by this learner first, then last answered wrong (most recent first), then the rest.
    select array_agg(c.id order by c.prio, c.last_at desc nulls last, c.rnd), min(c.section)
      into v_ids, v_section
    from (
      select q.id, q.section, random() as rnd, last.at as last_at,
             case when last.at is null then 0 when last.ok is false then 1 else 2 end as prio
      from public.exam_questions q
      join public.exam_forms f on f.id = q.form_id
      left join lateral (
        select a.submitted_at as at, (e ->> 'is_correct')::boolean as ok
        from public.exam_attempts a
        cross join lateral jsonb_array_elements(a.result -> 'review') as e
        where a.user_id = v_uid and a.status <> 'in_progress' and q.id = any (a.question_ids)
          and e ->> 'question_id' = q.id::text and e ->> 'answer' is not null
        order by a.submitted_at desc
        limit 1
      ) as last on true
      where f.family = v_form.family and f.language_code = v_form.language_code and f.status = 'published'
        and q.status = 'published' and q.question_type = p_question_type
      order by prio, last.at desc nulls last, rnd
      limit 10
    ) as c;
  else
    select array_agg(q.id order by array_position(array['listening', 'reading', 'writing'], q.section), q.seq, q.id)
      into v_ids
    from public.exam_questions q
    where q.form_id = p_form_id and q.status = 'published' and (p_mode = 'full' or q.section = p_section);
    v_section := case when p_mode = 'section' then p_section end;
  end if;
  if v_ids is null then
    raise exception using errcode = 'P0001', message = 'invalid_mode';
  end if;

  if p_mode = 'full' then
    select sum((v_form.time_limits ->> s.section)::integer)
      into v_minutes
    from (select distinct q.section from public.exam_questions q where q.id = any (v_ids)) as s
    where jsonb_typeof(v_form.time_limits -> s.section) = 'number';
  end if;

  insert into public.exam_attempts (
    user_id, learning_path_id, form_id, content_version, mode, section, question_type, question_ids, deadline_at
  ) values (
    v_uid, p_path_id, p_form_id, v_form.version, p_mode, v_section,
    v_qt, v_ids,
    case when coalesce(v_minutes, 0) > 0 then now() + make_interval(mins => v_minutes) end
  )
  returning id into v_id;
  return public.exam_attempt_json(v_id);
end;
$$;

-- In progress: examAttemptSchema; past deadline + grace: graded and closed as expired; closed:
-- examResultSchema.
create or replace function public.get_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.exam_attempts;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select a.* into v_att from public.exam_attempts a where a.id = p_attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;
  if v_att.status <> 'in_progress' then
    return v_att.result;
  end if;
  if public.exam_overdue(v_att.deadline_at) then
    return public.exam_close_attempt(v_att.id, 'expired');
  end if;
  return public.exam_attempt_json(v_att.id);
end;
$$;

-- Upserts the answer of one question (examSaveResultSchema). A replay of the latest key with the same
-- payload returns replayed: true; the key with another payload is idempotency_conflict. Past deadline +
-- grace the attempt is graded and closed as expired and the save is refused (saved: false). A null key
-- gets a fresh one (no replay protection).
create or replace function public.save_exam_answer(
  p_attempt_id uuid, p_question_id uuid, p_answer text, p_flagged boolean, p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.exam_attempts;
  v_kind text;
  v_answer text := nullif(p_answer, '');
  v_flagged boolean := coalesce(p_flagged, false);
  v_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_hash text;
  v_prev public.exam_answers;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select a.* into v_att from public.exam_attempts a where a.id = p_attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;

  v_hash := md5(concat_ws('|', p_attempt_id::text, coalesce(p_question_id::text, ''),
    coalesce(v_answer, chr(1)), v_flagged::text));
  select e.* into v_prev from public.exam_answers e where e.user_id = v_uid and e.idempotency_key = v_key;
  if found then
    if v_prev.payload_hash = v_hash then
      return jsonb_build_object('saved', true, 'status', v_att.status, 'server_now', now(), 'replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  if v_att.status = 'submitted' then
    raise exception using errcode = 'P0001', message = 'attempt_closed';
  end if;
  if v_att.status = 'in_progress' and public.exam_overdue(v_att.deadline_at) then
    perform public.exam_close_attempt(v_att.id, 'expired');
    v_att.status := 'expired';
  end if;
  if v_att.status = 'expired' then
    return jsonb_build_object('saved', false, 'status', 'expired', 'server_now', now(), 'replayed', false);
  end if;

  if p_question_id is null or not (p_question_id = any (v_att.question_ids)) then
    raise exception using errcode = 'P0001', message = 'question_not_in_attempt';
  end if;
  select q.kind into v_kind from public.exam_questions q where q.id = p_question_id;
  if char_length(v_answer) > (case when v_kind = 'essay' then 5000 else 200 end) then
    raise exception using errcode = 'P0001', message = 'answer_too_long';
  end if;

  begin
    insert into public.exam_answers (attempt_id, question_id, user_id, answer, flagged, idempotency_key, payload_hash)
    values (p_attempt_id, p_question_id, v_uid, v_answer, v_flagged, v_key, v_hash)
    on conflict (attempt_id, question_id) do update
      set answer = excluded.answer, flagged = excluded.flagged, idempotency_key = excluded.idempotency_key,
          payload_hash = excluded.payload_hash, updated_at = now();
  exception when unique_violation then
    -- The key is already used by another question of this user.
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end;
  return jsonb_build_object('saved', true, 'status', 'in_progress', 'server_now', now(), 'replayed', false);
end;
$$;

-- Grades and closes the attempt (examResultSchema): 'submitted', or 'expired' when past deadline +
-- grace. Idempotent: a closed attempt returns its stored result.
create or replace function public.submit_exam(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.exam_attempts;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select a.* into v_att from public.exam_attempts a where a.id = p_attempt_id and a.user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'attempt_not_found';
  end if;
  if v_att.status <> 'in_progress' then
    return v_att.result;
  end if;
  return public.exam_close_attempt(v_att.id, case when public.exam_overdue(v_att.deadline_at) then 'expired' else 'submitted' end);
end;
$$;

-- examHistoryEntrySchema[] of a path, newest first (p_limit clamped to 1..100, default 20).
create or replace function public.exam_history(p_path_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not exists (select 1 from public.learning_paths p where p.id = p_path_id and p.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'path_not_found';
  end if;
  return coalesce((
    select jsonb_agg(h.entry order by h.started_at desc, h.id)
    from (
      select a.id, a.started_at, jsonb_build_object(
          'attempt_id', a.id,
          'form_title_vi', f.title_vi,
          'family', f.family,
          'mode', a.mode,
          'section', a.section,
          'status', a.status,
          'started_at', a.started_at,
          'submitted_at', a.submitted_at,
          'total', a.result -> 'total',
          'max', a.result -> 'max',
          'estimated_level_code', a.result #> '{estimated_level,level_code}',
          'scoring_verified', coalesce((f.scoring ->> 'verified')::boolean, false)
        ) as entry
      from public.exam_attempts a
      join public.exam_forms f on f.id = a.form_id
      where a.learning_path_id = p_path_id and a.user_id = v_uid
      order by a.started_at desc, a.id
      limit least(greatest(coalesce(p_limit, 20), 1), 100)
    ) as h
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Import (bundle shape in the header; packages/shared/src/exam/bundle.ts examBundleSchema)
-- ---------------------------------------------------------------------------
-- One transaction: archive forms and questions absent from the bundle, then upsert by id: forms as in
-- import_diagnostic_bundle (insert; content_hash changed → rewrite, version + 1; review-only change →
-- update those; status walked through content_status_transition back to published); questions and
-- their keys are inserted, rewritten when any field differs, or left unchanged. Counts cover forms and
-- questions together.
create or replace function content_private.import_exam_bundle(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ins integer := 0;
  v_upd integer := 0;
  v_arch integer := 0;
  v_unch integer := 0;
  v_n integer;
  f jsonb;
  q jsonb;
  v_form public.exam_forms;
  v_q public.exam_questions;
  v_k content_private.exam_keys;
  v_status text;
  v_source uuid;
  v_step text;
  v_answer jsonb;
  v_rubric jsonb;
  v_prompt jsonb;
begin
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or (p_bundle -> 'bundle_version') is distinct from '1'::jsonb
     or jsonb_typeof(p_bundle -> 'forms') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_bundle';
  end if;
  if jsonb_array_length(p_bundle -> 'forms') = 0
     and exists (select 1 from public.exam_forms where status = 'published') then
    raise exception using errcode = 'P0001', message = 'empty_bundle';
  end if;
  perform pg_advisory_xact_lock(hashtext('linguo_exam_import'));

  perform set_config('linguo.content_import', 'archive', true);
  update public.exam_forms set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'forms') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  update public.exam_questions set status = 'archived'
  where status <> 'archived'
    and id not in (
      select (y ->> 'id')::uuid
      from jsonb_array_elements(p_bundle -> 'forms') x
      cross join lateral jsonb_array_elements(case when jsonb_typeof(x -> 'questions') = 'array' then x -> 'questions' else '[]'::jsonb end) y
    );
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;

  for f in select value from jsonb_array_elements(p_bundle -> 'forms') loop
    if jsonb_typeof(f -> 'questions') is distinct from 'array' or jsonb_array_length(f -> 'questions') = 0 then
      raise exception using errcode = 'P0001', message = 'invalid_bundle', detail = coalesce(f ->> 'key', 'null');
    end if;
    select s.id into v_source from public.content_sources s where s.key = f ->> 'source_key';
    if v_source is null then
      raise exception using errcode = 'P0001', message = 'source_not_found', detail = coalesce(f ->> 'source_key', 'null');
    end if;
    -- Every bundled form is published (examBundleSchema has no status: demo or reviewed files only).
    v_status := 'published';

    select * into v_form from public.exam_forms where id = (f ->> 'id')::uuid for update;
    if not found then
      insert into public.exam_forms (
        id, key, language_code, family, title_vi, description_vi, level_from, level_to, source_id, time_limits,
        scoring, status, is_demo, version, content_hash, reviewed_by, reviewed_at
      ) values (
        (f ->> 'id')::uuid, f ->> 'key', f ->> 'language_code', f ->> 'family', f ->> 'title_vi', f ->> 'description_vi',
        f ->> 'level_from', f ->> 'level_to', v_source, f -> 'time_limits', f -> 'scoring',
        v_status, (f ->> 'is_demo')::boolean, 1, f ->> 'content_hash', f ->> 'reviewed_by', (f ->> 'reviewed_at')::timestamptz
      );
      v_ins := v_ins + 1;
    elsif v_form.status = v_status
       and v_form.content_hash is not distinct from f ->> 'content_hash'
       and (v_form.is_demo, v_form.reviewed_by, v_form.reviewed_at) is not distinct from
           ((f ->> 'is_demo')::boolean, f ->> 'reviewed_by', (f ->> 'reviewed_at')::timestamptz) then
      v_unch := v_unch + 1;
    else
      -- Back from archived (or a hand-edited status): reopen as draft so content may change freely.
      if v_form.status <> v_status and v_form.status in ('archived', 'in_review', 'approved') then
        update public.exam_forms set status = 'draft' where id = v_form.id;
      end if;
      if v_form.content_hash is distinct from f ->> 'content_hash' then
        update public.exam_forms set
          key = f ->> 'key', language_code = f ->> 'language_code', family = f ->> 'family', title_vi = f ->> 'title_vi',
          description_vi = f ->> 'description_vi', level_from = f ->> 'level_from', level_to = f ->> 'level_to',
          source_id = v_source, time_limits = f -> 'time_limits', scoring = f -> 'scoring',
          is_demo = (f ->> 'is_demo')::boolean, reviewed_by = f ->> 'reviewed_by',
          reviewed_at = (f ->> 'reviewed_at')::timestamptz, content_hash = f ->> 'content_hash', version = version + 1
        where id = v_form.id;
      else
        update public.exam_forms set
          is_demo = (f ->> 'is_demo')::boolean, reviewed_by = f ->> 'reviewed_by',
          reviewed_at = (f ->> 'reviewed_at')::timestamptz
        where id = v_form.id;
      end if;
      -- Walk the status workflow up to the bundle status (always 'published', examBundleSchema).
      select status into v_step from public.exam_forms where id = v_form.id;
      if v_status = 'published' and v_step <> 'published' then
        foreach v_step in array array['in_review', 'approved', 'published'] loop
          update public.exam_forms set status = v_step where id = v_form.id;
        end loop;
      end if;
      v_upd := v_upd + 1;
    end if;

    for q in select value from jsonb_array_elements(f -> 'questions') loop
      v_answer := nullif(q -> 'answer', 'null'::jsonb);
      v_rubric := nullif(q -> 'rubric', 'null'::jsonb);
      v_prompt := q -> 'prompt';
      -- Cross-field rules of the authoring check (spec §2), enforced again at the trust boundary.
      if jsonb_typeof(v_prompt) is distinct from 'object'
         or not exists (select 1 from public.level_reference_hours h
                        where h.language_code = f ->> 'language_code' and h.level_code = q ->> 'level_code')
         or (q ->> 'kind' = 'mcq' and (jsonb_typeof(v_answer) is distinct from 'string'
             or not jsonb_path_exists(v_prompt, '$.options[*] ? (@.id == $k)', jsonb_build_object('k', v_answer))))
         or (q ->> 'kind' = 'short_text' and (jsonb_typeof(v_answer) is distinct from 'array' or jsonb_array_length(v_answer) = 0))
         or (q ->> 'kind' = 'essay' and (v_answer is not null or jsonb_typeof(v_rubric) is distinct from 'array'))
         or (q ->> 'section' = 'listening' and jsonb_typeof(q -> 'script') is distinct from 'string'
             and jsonb_typeof(v_prompt -> 'audio_asset_id') is distinct from 'string') then
        raise exception using errcode = 'P0001', message = 'invalid_bundle', detail = coalesce(q ->> 'key', 'null');
      end if;

      select * into v_q from public.exam_questions where id = (q ->> 'id')::uuid for update;
      if not found then
        insert into public.exam_questions (id, key, form_id, seq, section, kind, question_type, level_code, points, prompt, status)
        values ((q ->> 'id')::uuid, q ->> 'key', (f ->> 'id')::uuid, (q ->> 'seq')::integer, q ->> 'section', q ->> 'kind',
                q ->> 'question_type', q ->> 'level_code', (q ->> 'points')::integer, v_prompt, 'published');
        insert into content_private.exam_keys (question_id, answer, explanation, script, rubric, sample_answer)
        values ((q ->> 'id')::uuid, v_answer, q -> 'explanation', q ->> 'script', v_rubric, q ->> 'sample_answer');
        v_ins := v_ins + 1;
        continue;
      end if;

      select * into v_k from content_private.exam_keys where question_id = v_q.id;
      if (v_q.key, v_q.form_id, v_q.seq, v_q.section, v_q.kind, v_q.question_type, v_q.level_code, v_q.points, v_q.prompt, v_q.status)
           is not distinct from
         (q ->> 'key', (f ->> 'id')::uuid, (q ->> 'seq')::integer, q ->> 'section', q ->> 'kind', q ->> 'question_type',
          q ->> 'level_code', (q ->> 'points')::integer, v_prompt, 'published')
         and (v_k.answer, v_k.explanation, v_k.script, v_k.rubric, v_k.sample_answer) is not distinct from
             (v_answer, q -> 'explanation', q ->> 'script', v_rubric, q ->> 'sample_answer') then
        v_unch := v_unch + 1;
        continue;
      end if;

      update public.exam_questions set
        key = q ->> 'key', form_id = (f ->> 'id')::uuid, seq = (q ->> 'seq')::integer, section = q ->> 'section',
        kind = q ->> 'kind', question_type = q ->> 'question_type', level_code = q ->> 'level_code',
        points = (q ->> 'points')::integer, prompt = v_prompt, status = 'published'
      where id = v_q.id;
      insert into content_private.exam_keys (question_id, answer, explanation, script, rubric, sample_answer)
      values (v_q.id, v_answer, q -> 'explanation', q ->> 'script', v_rubric, q ->> 'sample_answer')
      on conflict (question_id) do update set
        answer = excluded.answer, explanation = excluded.explanation, script = excluded.script,
        rubric = excluded.rubric, sample_answer = excluded.sample_answer, updated_at = now();
      v_upd := v_upd + 1;
    end loop;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'archived', v_arch, 'unchanged', v_unch);
end;
$$;

comment on function content_private.import_exam_bundle(jsonb) is
  'Imports exam forms, questions and keys (packages/shared/src/exam/bundle.ts examBundleSchema). service_role only.';

-- PostgREST entry point for `pnpm content:push`, like public.import_diagnostic_content_bundle: no logic
-- of its own, service_role only.
create or replace function public.import_exam_content_bundle(p_bundle jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select content_private.import_exam_bundle(p_bundle);
$$;

comment on function public.import_exam_content_bundle(jsonb) is
  'PostgREST wrapper around content_private.import_exam_bundle for the content importer. service_role only.';

-- ---------------------------------------------------------------------------
-- Function privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default.
-- ---------------------------------------------------------------------------
revoke all on function public.exam_normalize_text(text) from public, anon, authenticated;
revoke all on function public.exam_structure_warning(text, text) from public, anon, authenticated;
revoke all on function public.exam_served_prompt(jsonb, text) from public, anon, authenticated;
revoke all on function public.exam_overdue(timestamptz) from public, anon, authenticated;
revoke all on function public.exam_attempt_json(uuid) from public, anon, authenticated;
revoke all on function public.exam_build_result(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.exam_close_attempt(uuid, text) from public, anon, authenticated;

revoke all on function public.list_exam_forms(text) from public, anon;
revoke all on function public.start_exam(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.get_exam_attempt(uuid) from public, anon;
revoke all on function public.save_exam_answer(uuid, uuid, text, boolean, uuid) from public, anon;
revoke all on function public.submit_exam(uuid) from public, anon;
revoke all on function public.exam_history(uuid, integer) from public, anon;
grant execute on function public.list_exam_forms(text) to authenticated;
grant execute on function public.start_exam(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.get_exam_attempt(uuid) to authenticated;
grant execute on function public.save_exam_answer(uuid, uuid, text, boolean, uuid) to authenticated;
grant execute on function public.submit_exam(uuid) to authenticated;
grant execute on function public.exam_history(uuid, integer) to authenticated;

revoke all on function content_private.import_exam_bundle(jsonb) from public, anon, authenticated;
grant execute on function content_private.import_exam_bundle(jsonb) to service_role;
revoke all on function public.import_exam_content_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.import_exam_content_bundle(jsonb) to service_role;
