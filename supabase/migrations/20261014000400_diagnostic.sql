-- Linguo spec 4 §3: adaptive diagnostic schema — assessments (config), the item bank with its answer
-- keys, learner attempts and their responses. Scores land in the existing public.skill_estimates
-- (source 'diagnostic'), which is reused unchanged.
--
-- Clients only ever read their own attempts (RLS); everything else is server-only. The item bank and
-- the responses hold answer keys / correctness and grant nothing to anon or authenticated: the
-- SECURITY DEFINER RPCs of the later diagnostic migrations are the only way in or out.

-- ---------------------------------------------------------------------------
-- Assessments (one published diagnostic per language)
-- ---------------------------------------------------------------------------
create table public.assessments (
  -- UUIDv5 of key under CONTENT_UUID_NAMESPACE (packages/shared/src/content/bundle.ts).
  id uuid primary key,
  key text not null unique,
  language_code text not null check (language_code in ('en', 'ko')),
  assessment_type text not null check (assessment_type in ('diagnostic')),
  version integer not null default 1 check (version >= 1),
  is_published boolean not null default false,
  -- Engine and policy constants (spec §2); see the seed rows below for the full set of keys.
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language_code, assessment_type, version),
  -- Target of the composite FK from assessment_items, so an item's language is its assessment's.
  unique (id, language_code),
  constraint assessments_config_shape check (
    jsonb_typeof(config) = 'object'
    and config ?& array[
      'cooldown_days', 'abandon_days', 'max_items', 'foundation_max_items', 'foundation_max_b', 'prior_sd',
      'stop_sd', 'min_items', 'max_items_per_skill', 'max_items_reading', 'rapid_ms', 'rapid_share'
    ]
  )
);

create unique index assessments_one_published on public.assessments (language_code, assessment_type) where is_published;

comment on table public.assessments is 'Diagnostic definitions with engine/policy config. Server-only.';

create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

insert into public.assessments (id, key, language_code, assessment_type, version, is_published, config) values
  ('994a20b9-416d-53f4-8918-00c27dc1dc74', 'en:assessment:diagnostic:v1', 'en', 'diagnostic', 1, true,
   '{"cooldown_days": 14, "abandon_days": 7, "max_items": 30, "foundation_max_items": 8, "foundation_max_b": 1.5,
     "prior_sd": 1.25, "stop_sd": 0.45, "min_items": 4, "max_items_per_skill": 8, "max_items_reading": 5,
     "rapid_ms": 800, "rapid_share": 0.3}'),
  ('7e36a091-ea02-5718-b5ee-72a402246a79', 'ko:assessment:diagnostic:v1', 'ko', 'diagnostic', 1, true,
   '{"cooldown_days": 14, "abandon_days": 7, "max_items": 30, "foundation_max_items": 8, "foundation_max_b": 1.5,
     "prior_sd": 1.25, "stop_sd": 0.45, "min_items": 4, "max_items_per_skill": 8, "max_items_reading": 5,
     "rapid_ms": 800, "rapid_share": 0.3}');

-- ---------------------------------------------------------------------------
-- Item bank (answer keys included: never granted to clients)
-- ---------------------------------------------------------------------------
-- Common content columns as in the content migration: id (UUIDv5 of key), key, status, is_demo,
-- reviewed_by, reviewed_at, version, content_hash, created_at, updated_at.
create table public.assessment_items (
  id uuid primary key,
  key text not null unique,
  assessment_id uuid not null,
  language_code text not null check (language_code in ('en', 'ko')),
  skill text not null check (skill in ('vocabulary', 'grammar', 'reading')),
  level_code text not null,
  -- IRT difficulty b on the level-ordinal scale (importer default: ordinal(level_code) + 0.5).
  difficulty numeric not null check (difficulty between -1 and 7),
  item_type text not null check (item_type in ('mcq', 'cloze_choice', 'reading_mcq')),
  -- Public part: {stem, stem_lang, passage?, options: [{id, text, lang}]} (rpc.ts diagnosticItemSchema).
  prompt jsonb not null,
  -- Id of the correct option in prompt.options.
  answer_key text not null,
  explanation jsonb check (explanation is null or jsonb_typeof(explanation) = 'object'),
  key_confidence text not null default 'unreviewed' check (key_confidence in ('unreviewed', 'reviewed')),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_items_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null),
  constraint assessment_items_assessment_fk foreign key (assessment_id, language_code)
    references public.assessments (id, language_code) on delete restrict,
  constraint assessment_items_level_fk foreign key (language_code, level_code)
    references public.level_reference_hours (language_code, level_code),
  constraint assessment_items_prompt_shape check (
    jsonb_typeof(prompt) = 'object'
    and jsonb_typeof(prompt -> 'stem') = 'string'
    and jsonb_typeof(prompt -> 'options') = 'array'
    and jsonb_array_length(prompt -> 'options') between 2 and 6
  ),
  constraint assessment_items_answer_is_option check (
    jsonb_path_exists(prompt, '$.options[*] ? (@.id == $k)', jsonb_build_object('k', answer_key))
  ),
  constraint assessment_items_reading_passage check (
    item_type <> 'reading_mcq' or jsonb_typeof(prompt -> 'passage') = 'string'
  )
);

create index assessment_items_bank_idx on public.assessment_items (assessment_id, skill, difficulty) where status = 'published';
create index assessment_items_language_level_idx on public.assessment_items (language_code, level_code);

comment on table public.assessment_items is 'Diagnostic item bank incl. answer_key/explanation. No client grants; read only by SECURITY DEFINER RPCs.';
comment on column public.assessment_items.prompt is 'Public part served to learners. Must never contain the answer key.';

create trigger assessment_items_set_updated_at
  before update on public.assessment_items
  for each row execute function public.set_updated_at();
-- Same status workflow as the lesson content (content migration).
create trigger assessment_items_status_transition
  before update on public.assessment_items
  for each row execute function public.content_status_transition();

-- ---------------------------------------------------------------------------
-- Attempts (learner-visible through RLS, written only by RPCs)
-- ---------------------------------------------------------------------------
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  mode text not null default 'full' check (mode in ('full', 'foundation')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  -- Item served and awaiting an answer (null between skills or once done).
  current_item_id uuid references public.assessment_items (id) on delete restrict,
  current_served_at timestamptz,
  -- Skipped skills: {"<skill>": "<reason>"}.
  skipped jsonb not null default '{}' check (jsonb_typeof(skipped) = 'object'),
  -- DiagnosticReport (rpc.ts) written by finish_diagnostic.
  report jsonb check (report is null or jsonb_typeof(report) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  applied_at timestamptz,
  last_activity_at timestamptz not null default now(),
  constraint assessment_attempts_current_item_pair check ((current_item_id is null) = (current_served_at is null)),
  constraint assessment_attempts_current_only_in_progress check (status = 'in_progress' or current_item_id is null),
  constraint assessment_attempts_completed_shape check (status <> 'completed' or (completed_at is not null and report is not null)),
  constraint assessment_attempts_applied_only_completed check (applied_at is null or status = 'completed')
);

-- At most one in-progress attempt per learning path.
create unique index assessment_attempts_one_in_progress on public.assessment_attempts (learning_path_id) where status = 'in_progress';
create index assessment_attempts_path_started_idx on public.assessment_attempts (learning_path_id, started_at desc);
create index assessment_attempts_path_completed_idx on public.assessment_attempts (learning_path_id, completed_at desc) where status = 'completed';
create index assessment_attempts_user_id_idx on public.assessment_attempts (user_id);
create index assessment_attempts_assessment_id_idx on public.assessment_attempts (assessment_id);
create index assessment_attempts_current_item_id_idx on public.assessment_attempts (current_item_id);

-- ---------------------------------------------------------------------------
-- Responses (hold correctness: never granted to clients)
-- ---------------------------------------------------------------------------
create table public.assessment_responses (
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  seq integer not null check (seq >= 1),
  item_id uuid not null references public.assessment_items (id) on delete restrict,
  skill text not null check (skill in ('vocabulary', 'grammar', 'reading')),
  -- Chosen option id; null = "Tôi không biết" (scored as wrong).
  choice text,
  is_correct boolean not null,
  served_at timestamptz not null,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, seq),
  unique (attempt_id, item_id),
  constraint assessment_responses_answered_after_served check (answered_at >= served_at),
  constraint assessment_responses_dont_know_is_wrong check (choice is not null or not is_correct)
);

create index assessment_responses_item_id_idx on public.assessment_responses (item_id);

comment on table public.assessment_responses is 'Diagnostic answers with correctness. No client grants; read only by SECURITY DEFINER RPCs.';

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;

-- assessments, assessment_items, assessment_responses: no policy, no grant (server-only).
create policy "assessment attempts: read own" on public.assessment_attempts
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.assessments, public.assessment_items, public.assessment_attempts, public.assessment_responses
  from public, anon, authenticated;
grant select on public.assessment_attempts to authenticated;
