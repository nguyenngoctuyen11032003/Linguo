-- Linguo spec 2 §3: content tables (programs → units → lessons → exercises, learning items, sources),
-- private answer keys and revisions, status workflow, RLS (published only) and the import RPC.
-- Clients only ever read published rows; content is written only by content_private.import_bundle,
-- which only service_role may call. Answer keys and explanations live in content_private, which is
-- not exposed through the API (supabase/config.toml api.schemas) and grants nothing to clients.

-- Used by the grading functions of the lesson-runs migration.
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create schema content_private;

comment on schema content_private is 'Answer keys, explanations and revisions. Never exposed to anon/authenticated.';

-- ---------------------------------------------------------------------------
-- Tables (public)
-- ---------------------------------------------------------------------------
-- Common columns: id (UUIDv5 of key), key, status, is_demo, reviewed_by, reviewed_at, version,
-- content_hash, created_at, updated_at; demo rows may be approved/published without a review.

create table public.content_sources (
  id uuid primary key,
  key text not null unique,
  title text not null check (char_length(title) between 1 and 200),
  author_or_org text not null check (char_length(author_or_org) between 1 and 200),
  url text,
  license text not null check (license in ('own', 'cc_by', 'cc_by_sa', 'public_domain', 'licensed')),
  attribution_required boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_sources_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null)
);

create table public.programs (
  id uuid primary key,
  key text not null unique,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  language_code text not null check (language_code in ('en', 'ko')),
  title jsonb not null check (title ? 'vi'),
  description jsonb not null check (description ? 'vi'),
  kind text not null check (kind in ('core', 'goal')),
  goal_types text[] not null default '{}',
  level_from text not null,
  level_to text not null,
  order_index integer not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null),
  constraint programs_goal_types_only_for_goal check (kind = 'goal' or goal_types = '{}'),
  constraint programs_level_from_fk foreign key (language_code, level_from) references public.level_reference_hours (language_code, level_code),
  constraint programs_level_to_fk foreign key (language_code, level_to) references public.level_reference_hours (language_code, level_code)
);

create table public.units (
  id uuid primary key,
  key text not null unique,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  program_id uuid not null references public.programs (id) on delete restrict,
  order_index integer not null,
  title jsonb not null check (title ? 'vi'),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null)
);

create table public.lessons (
  id uuid primary key,
  key text not null unique,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  unit_id uuid not null references public.units (id) on delete restrict,
  language_code text not null check (language_code in ('en', 'ko')),
  level_code text not null,
  order_index integer not null,
  title jsonb not null check (title ? 'vi'),
  objectives jsonb not null check (jsonb_typeof(objectives) = 'array' and jsonb_array_length(objectives) >= 1),
  body jsonb not null check (jsonb_typeof(body) = 'array'),
  estimated_minutes integer not null check (estimated_minutes between 1 and 60),
  skills text[] not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Bumped with version; the importer hashes a lesson together with its exercises, items and prerequisites.
  content_version integer generated always as (version) stored,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null),
  constraint lessons_level_fk foreign key (language_code, level_code) references public.level_reference_hours (language_code, level_code)
);

create table public.lesson_prerequisites (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  prerequisite_lesson_id uuid not null references public.lessons (id) on delete cascade,
  primary key (lesson_id, prerequisite_lesson_id),
  constraint lesson_prerequisites_not_self check (lesson_id <> prerequisite_lesson_id)
);

create table public.learning_items (
  id uuid primary key,
  key text not null unique,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  language_code text not null check (language_code in ('en', 'ko')),
  item_type text not null check (item_type in ('vocab', 'phrase', 'grammar_point', 'hangul')),
  level_code text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  skill_tags text[] not null default '{}',
  front jsonb not null check (jsonb_typeof(front) = 'object'),
  back jsonb not null check (jsonb_typeof(back) = 'object'),
  audio_path text,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_items_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null),
  constraint learning_items_level_fk foreign key (language_code, level_code) references public.level_reference_hours (language_code, level_code)
);

create table public.lesson_items (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  item_id uuid not null references public.learning_items (id) on delete restrict,
  position integer not null,
  role text not null check (role in ('introduce', 'reuse')),
  primary key (lesson_id, item_id)
);

create table public.exercises (
  id uuid primary key,
  key text not null unique,
  source_id uuid not null references public.content_sources (id) on delete restrict,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  item_id uuid references public.learning_items (id) on delete restrict,
  order_index integer not null,
  exercise_type text not null check (exercise_type in ('mcq', 'fill_blank', 'word_bank', 'translate', 'listen')),
  stage text not null check (stage in ('recognition', 'recall', 'application')),
  answer_lang text not null check (answer_lang in ('en', 'ko', 'vi')),
  prompt jsonb not null check (jsonb_typeof(prompt) = 'object'),
  difficulty smallint not null check (difficulty between 1 and 5),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  is_demo boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_reviewed check (status not in ('approved', 'published') or is_demo or reviewed_at is not null)
);

-- Ordering is unique among live rows only, so an archived row never blocks its slot.
create unique index units_program_order_key on public.units (program_id, order_index) where status <> 'archived';
create unique index lessons_unit_order_key on public.lessons (unit_id, order_index) where status <> 'archived';
create unique index exercises_lesson_order_key on public.exercises (lesson_id, order_index) where status <> 'archived';
create unique index lesson_items_one_introduction on public.lesson_items (item_id) where role = 'introduce';

create index programs_source_id_idx on public.programs (source_id);
create index units_program_id_idx on public.units (program_id);
create index lessons_unit_id_idx on public.lessons (unit_id);
create index lessons_published_level_idx on public.lessons (language_code, level_code) where status = 'published';
create index lesson_prerequisites_prerequisite_idx on public.lesson_prerequisites (prerequisite_lesson_id);
create index lesson_items_item_id_idx on public.lesson_items (item_id);
create index exercises_lesson_id_idx on public.exercises (lesson_id);
create index exercises_item_id_idx on public.exercises (item_id);

comment on table public.lessons is 'Lessons. content_version follows version; the importer bumps version when the lesson or any child changes.';
comment on table public.exercises is 'Public exercise prompts. Answers live in content_private.exercise_keys keyed by (exercise_id, version).';

-- ---------------------------------------------------------------------------
-- Tables (content_private)
-- ---------------------------------------------------------------------------
create table content_private.exercise_keys (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  version integer not null check (version >= 1),
  answer_key jsonb not null,
  rubric jsonb not null,
  known_wrong jsonb not null default '[]',
  explanation jsonb not null check (explanation ? 'vi'),
  display_answer text not null,
  created_at timestamptz not null default now(),
  primary key (exercise_id, version)
);

create table content_private.revisions (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('content_sources', 'programs', 'units', 'learning_items', 'lessons', 'exercises')),
  entity_id uuid not null,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  content_hash text not null,
  imported_at timestamptz not null default now(),
  git_sha text,
  unique (entity_type, entity_id, version)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger content_sources_set_updated_at before update on public.content_sources
  for each row execute function public.set_updated_at();
create trigger programs_set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger learning_items_set_updated_at before update on public.learning_items
  for each row execute function public.set_updated_at();
create trigger exercises_set_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

-- Status workflow (spec §3.3): draft → in_review → approved → published → archived → draft,
-- with in_review/approved → draft. A published non-demo row may only change together with a
-- version bump and a new review. import_bundle sets linguo.content_import (transaction-local) to
-- 'archive' while archiving rows absent from a bundle (any status → archived), and to 'reorder'
-- while it parks order_index values of rows it is about to rewrite.
create or replace function public.content_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mode text := coalesce(current_setting('linguo.content_import', true), '');
begin
  if old.status = new.status then
    if new.status <> 'published'
       or new.is_demo
       or (new.version > old.version and new.reviewed_at is distinct from old.reviewed_at)
       or v_mode = 'reorder' then
      return new;
    end if;
  elsif (old.status = 'draft' and new.status = 'in_review')
     or (old.status = 'in_review' and new.status in ('draft', 'approved'))
     or (old.status = 'approved' and new.status in ('published', 'draft'))
     or (old.status = 'published' and new.status = 'archived')
     or (old.status = 'archived' and new.status = 'draft')
     or (new.status = 'archived' and v_mode = 'archive') then
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'invalid_status_transition';
end;
$$;

create trigger content_sources_status_transition before update on public.content_sources
  for each row execute function public.content_status_transition();
create trigger programs_status_transition before update on public.programs
  for each row execute function public.content_status_transition();
create trigger units_status_transition before update on public.units
  for each row execute function public.content_status_transition();
create trigger lessons_status_transition before update on public.lessons
  for each row execute function public.content_status_transition();
create trigger learning_items_status_transition before update on public.learning_items
  for each row execute function public.content_status_transition();
create trigger exercises_status_transition before update on public.exercises
  for each row execute function public.content_status_transition();

-- published_at records when a lesson becomes published (on insert or on transition).
create or replace function public.lessons_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger lessons_set_published_at before insert or update of status on public.lessons
  for each row execute function public.lessons_set_published_at();

-- A lesson's language must be its program's language.
create or replace function public.lessons_language_matches_program()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.units u
    join public.programs p on p.id = u.program_id
    where u.id = new.unit_id and p.language_code = new.language_code
  ) then
    raise exception using errcode = 'P0001', message = 'lesson_language_mismatch';
  end if;
  return new;
end;
$$;

create trigger lessons_language_matches_program before insert or update of unit_id, language_code on public.lessons
  for each row execute function public.lessons_language_matches_program();

-- Prerequisites: same language, no cycles. A row (lesson, prerequisite) closes a cycle when the
-- lesson is reachable from the prerequisite by following existing prerequisite edges.
create or replace function public.lesson_prerequisites_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select language_code from public.lessons where id = new.lesson_id)
     is distinct from (select language_code from public.lessons where id = new.prerequisite_lesson_id) then
    raise exception using errcode = 'P0001', message = 'prerequisite_language_mismatch';
  end if;
  if exists (
    with recursive reach (id) as (
      select new.prerequisite_lesson_id
      union
      select lp.prerequisite_lesson_id
      from public.lesson_prerequisites lp
      join reach r on lp.lesson_id = r.id
    )
    select 1 from reach where id = new.lesson_id
  ) then
    raise exception using errcode = 'P0001', message = 'prerequisite_cycle';
  end if;
  return new;
end;
$$;

create trigger lesson_prerequisites_guard before insert or update on public.lesson_prerequisites
  for each row execute function public.lesson_prerequisites_guard();

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.content_sources enable row level security;
alter table public.programs enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_prerequisites enable row level security;
alter table public.learning_items enable row level security;
alter table public.lesson_items enable row level security;
alter table public.exercises enable row level security;
alter table content_private.exercise_keys enable row level security;
alter table content_private.revisions enable row level security;

-- Policies run as the invoker, so the RLS of the parent tables applies inside the exists() checks.
create policy content_sources_select_published on public.content_sources
  for select to authenticated using (status = 'published');
create policy programs_select_published on public.programs
  for select to authenticated using (status = 'published');
create policy learning_items_select_published on public.learning_items
  for select to authenticated using (status = 'published');
create policy units_select_published on public.units
  for select to authenticated using (
    status = 'published'
    and exists (select 1 from public.programs p where p.id = program_id and p.status = 'published')
  );
create policy lessons_select_published on public.lessons
  for select to authenticated using (
    status = 'published'
    and exists (
      select 1
      from public.units u
      join public.programs p on p.id = u.program_id
      where u.id = unit_id and u.status = 'published' and p.status = 'published'
    )
  );
create policy exercises_select_published on public.exercises
  for select to authenticated using (
    status = 'published'
    and exists (select 1 from public.lessons l where l.id = lesson_id)
  );
create policy lesson_items_select_published on public.lesson_items
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_id));
create policy lesson_prerequisites_select_published on public.lesson_prerequisites
  for select to authenticated using (
    exists (select 1 from public.lessons l where l.id = lesson_id)
    and exists (select 1 from public.lessons l where l.id = prerequisite_lesson_id)
  );

revoke all on public.content_sources, public.programs, public.units, public.lessons, public.lesson_prerequisites,
  public.learning_items, public.lesson_items, public.exercises from anon, authenticated;
grant select on public.content_sources, public.programs, public.units, public.lessons, public.lesson_prerequisites,
  public.learning_items, public.lesson_items, public.exercises to authenticated;

revoke all on schema content_private from public, anon, authenticated;
revoke all on all tables in schema content_private from public, anon, authenticated;
revoke all on all sequences in schema content_private from public, anon, authenticated;
-- service_role only needs to reach import_bundle; it gets no table privileges here.
grant usage on schema content_private to service_role;

revoke all on function public.content_status_transition() from public, anon, authenticated;
revoke all on function public.lessons_set_published_at() from public, anon, authenticated;
revoke all on function public.lessons_language_matches_program() from public, anon, authenticated;
revoke all on function public.lesson_prerequisites_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Import (spec §3.5, bundle shape: packages/shared/src/content/bundle.ts)
-- ---------------------------------------------------------------------------
-- One transaction. Per entity table, in dependency order: archive rows absent from the bundle,
-- park order_index of rows about to be rewritten, then upsert by id: insert (inserted); content_hash
-- changed → rewrite, version + 1, revision row (updated); only status/review changed → update those
-- (updated); else unchanged. Prerequisites and item links are replaced per bundled lesson. Exercise
-- answer keys are stored per (exercise, version); older versions are kept.
create or replace function content_private.import_bundle(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_git text;
  v_ins integer := 0;
  v_upd integer := 0;
  v_arch integer := 0;
  v_unch integer := 0;
  v_n integer;
  v_version integer;
  v_lesson_ids uuid[];
  r jsonb;
  v_src public.content_sources;
  v_prog public.programs;
  v_unit public.units;
  v_item public.learning_items;
  v_lesson public.lessons;
  v_ex public.exercises;
begin
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or (p_bundle -> 'bundle_version') is distinct from '1'::jsonb
     or exists (
       select 1
       from unnest(array['sources', 'programs', 'units', 'lessons', 'lesson_prerequisites', 'learning_items', 'lesson_items', 'exercises']) as k
       where jsonb_typeof(p_bundle -> k) is distinct from 'array'
     ) then
    raise exception using errcode = 'P0001', message = 'invalid_bundle';
  end if;
  v_git := p_bundle ->> 'git_sha';

  -- ===== content_sources =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.content_sources set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'sources') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'sources') loop
    select * into v_src from public.content_sources where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.content_sources (
        id, key, title, author_or_org, url, license, attribution_required,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', r ->> 'title', r ->> 'author_or_org', r ->> 'url', r ->> 'license',
        (r ->> 'attribution_required')::boolean,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('content_sources', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_src.content_hash <> r ->> 'content_hash' then
      update public.content_sources set
        key = r ->> 'key', title = r ->> 'title', author_or_org = r ->> 'author_or_org', url = r ->> 'url',
        license = r ->> 'license', attribution_required = (r ->> 'attribution_required')::boolean,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_src.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('content_sources', v_src.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif (v_src.status, v_src.is_demo, v_src.reviewed_by, v_src.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.content_sources set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_src.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== programs =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.programs set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'programs') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'programs') loop
    select * into v_prog from public.programs where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.programs (
        id, key, source_id, language_code, title, description, kind, goal_types, level_from, level_to, order_index,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, r ->> 'language_code', r -> 'title', r -> 'description',
        r ->> 'kind', array(select jsonb_array_elements_text(r -> 'goal_types')), r ->> 'level_from', r ->> 'level_to',
        (r ->> 'order_index')::integer,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('programs', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_prog.content_hash <> r ->> 'content_hash' then
      update public.programs set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, language_code = r ->> 'language_code',
        title = r -> 'title', description = r -> 'description', kind = r ->> 'kind',
        goal_types = array(select jsonb_array_elements_text(r -> 'goal_types')),
        level_from = r ->> 'level_from', level_to = r ->> 'level_to', order_index = (r ->> 'order_index')::integer,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_prog.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('programs', v_prog.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif (v_prog.status, v_prog.is_demo, v_prog.reviewed_by, v_prog.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.programs set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_prog.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== units =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.units set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'units') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.units t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'units') x
  where t.id = (x ->> 'id')::uuid and t.content_hash <> x ->> 'content_hash'
    and t.order_index <> (x ->> 'order_index')::integer;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'units') loop
    select * into v_unit from public.units where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.units (
        id, key, source_id, program_id, order_index, title,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'program_id')::uuid,
        (r ->> 'order_index')::integer, r -> 'title',
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('units', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_unit.content_hash <> r ->> 'content_hash' then
      update public.units set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, program_id = (r ->> 'program_id')::uuid,
        order_index = (r ->> 'order_index')::integer, title = r -> 'title',
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_unit.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('units', v_unit.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif (v_unit.status, v_unit.is_demo, v_unit.reviewed_by, v_unit.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.units set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_unit.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== learning_items =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.learning_items set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'learning_items') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'learning_items') loop
    select * into v_item from public.learning_items where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.learning_items (
        id, key, source_id, language_code, item_type, level_code, difficulty, skill_tags, front, back, audio_path,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, r ->> 'language_code', r ->> 'item_type',
        r ->> 'level_code', (r ->> 'difficulty')::smallint, array(select jsonb_array_elements_text(r -> 'skill_tags')),
        r -> 'front', r -> 'back', r ->> 'audio_path',
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('learning_items', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_item.content_hash <> r ->> 'content_hash' then
      update public.learning_items set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, language_code = r ->> 'language_code',
        item_type = r ->> 'item_type', level_code = r ->> 'level_code', difficulty = (r ->> 'difficulty')::smallint,
        skill_tags = array(select jsonb_array_elements_text(r -> 'skill_tags')),
        front = r -> 'front', back = r -> 'back', audio_path = r ->> 'audio_path',
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_item.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('learning_items', v_item.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif (v_item.status, v_item.is_demo, v_item.reviewed_by, v_item.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.learning_items set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_item.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== lessons =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.lessons set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'lessons') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.lessons t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'lessons') x
  where t.id = (x ->> 'id')::uuid and t.content_hash <> x ->> 'content_hash'
    and t.order_index <> (x ->> 'order_index')::integer;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'lessons') loop
    select * into v_lesson from public.lessons where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.lessons (
        id, key, source_id, unit_id, language_code, level_code, order_index, title, objectives, body,
        estimated_minutes, skills, status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'unit_id')::uuid, r ->> 'language_code',
        r ->> 'level_code', (r ->> 'order_index')::integer, r -> 'title', r -> 'objectives', r -> 'body',
        (r ->> 'estimated_minutes')::integer, array(select jsonb_array_elements_text(r -> 'skills')),
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('lessons', (r ->> 'id')::uuid, 1, r, r ->> 'content_hash', v_git);
      v_ins := v_ins + 1;
    elsif v_lesson.content_hash <> r ->> 'content_hash' then
      update public.lessons set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, unit_id = (r ->> 'unit_id')::uuid,
        language_code = r ->> 'language_code', level_code = r ->> 'level_code', order_index = (r ->> 'order_index')::integer,
        title = r -> 'title', objectives = r -> 'objectives', body = r -> 'body',
        estimated_minutes = (r ->> 'estimated_minutes')::integer, skills = array(select jsonb_array_elements_text(r -> 'skills')),
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_lesson.id
      returning version into v_version;
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('lessons', v_lesson.id, v_version, r, r ->> 'content_hash', v_git);
      v_upd := v_upd + 1;
    elsif (v_lesson.status, v_lesson.is_demo, v_lesson.reviewed_by, v_lesson.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.lessons set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_lesson.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;
  end loop;

  -- ===== lesson_prerequisites / lesson_items: replaced for every bundled lesson =====
  -- Item links of archived lessons are dropped too, so an archived lesson never holds an introduction.
  v_lesson_ids := array(select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'lessons') x);

  delete from public.lesson_prerequisites where lesson_id = any (v_lesson_ids);
  for r in select value from jsonb_array_elements(p_bundle -> 'lesson_prerequisites') loop
    insert into public.lesson_prerequisites (lesson_id, prerequisite_lesson_id)
    values ((r ->> 'lesson_id')::uuid, (r ->> 'prerequisite_lesson_id')::uuid);
  end loop;

  delete from public.lesson_items li
  where li.lesson_id = any (v_lesson_ids)
     or exists (select 1 from public.lessons l where l.id = li.lesson_id and l.status = 'archived');
  for r in select value from jsonb_array_elements(p_bundle -> 'lesson_items') loop
    insert into public.lesson_items (lesson_id, item_id, position, role)
    values ((r ->> 'lesson_id')::uuid, (r ->> 'item_id')::uuid, (r ->> 'position')::integer, r ->> 'role');
  end loop;

  -- ===== exercises (+ content_private.exercise_keys per version) =====
  perform set_config('linguo.content_import', 'archive', true);
  update public.exercises set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'exercises') x);
  get diagnostics v_n = row_count;
  v_arch := v_arch + v_n;
  perform set_config('linguo.content_import', 'reorder', true);
  update public.exercises t set order_index = -1 - t.order_index
  from jsonb_array_elements(p_bundle -> 'exercises') x
  where t.id = (x ->> 'id')::uuid and t.content_hash <> x ->> 'content_hash'
    and t.order_index <> (x ->> 'order_index')::integer;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'exercises') loop
    v_version := null;
    select * into v_ex from public.exercises where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.exercises (
        id, key, source_id, lesson_id, item_id, order_index, exercise_type, stage, answer_lang, prompt, difficulty,
        status, is_demo, reviewed_by, reviewed_at, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', (r ->> 'source_id')::uuid, (r ->> 'lesson_id')::uuid, (r ->> 'item_id')::uuid,
        (r ->> 'order_index')::integer, r ->> 'exercise_type', r ->> 'stage', r ->> 'answer_lang', r -> 'prompt',
        (r ->> 'difficulty')::smallint,
        r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, r ->> 'content_hash'
      );
      v_version := 1;
      v_ins := v_ins + 1;
    elsif v_ex.content_hash <> r ->> 'content_hash' then
      update public.exercises set
        key = r ->> 'key', source_id = (r ->> 'source_id')::uuid, lesson_id = (r ->> 'lesson_id')::uuid,
        item_id = (r ->> 'item_id')::uuid, order_index = (r ->> 'order_index')::integer,
        exercise_type = r ->> 'exercise_type', stage = r ->> 'stage', answer_lang = r ->> 'answer_lang',
        prompt = r -> 'prompt', difficulty = (r ->> 'difficulty')::smallint,
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz, content_hash = r ->> 'content_hash', version = version + 1
      where id = v_ex.id
      returning version into v_version;
      v_upd := v_upd + 1;
    elsif (v_ex.status, v_ex.is_demo, v_ex.reviewed_by, v_ex.reviewed_at) is distinct from
          (r ->> 'status', (r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      update public.exercises set
        status = r ->> 'status', is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_ex.id;
      v_upd := v_upd + 1;
    else
      v_unch := v_unch + 1;
    end if;

    if v_version is not null then
      insert into content_private.revisions (entity_type, entity_id, version, snapshot, content_hash, git_sha)
      values ('exercises', (r ->> 'id')::uuid, v_version, r, r ->> 'content_hash', v_git);
      insert into content_private.exercise_keys (exercise_id, version, answer_key, rubric, known_wrong, explanation, display_answer)
      values (
        (r ->> 'id')::uuid, v_version, r -> 'key_data' -> 'answer_key', r -> 'key_data' -> 'rubric',
        coalesce(r -> 'key_data' -> 'known_wrong', '[]'::jsonb), r -> 'key_data' -> 'explanation',
        r -> 'key_data' ->> 'display_answer'
      )
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'archived', v_arch, 'unchanged', v_unch);
end;
$$;

comment on function content_private.import_bundle(jsonb) is 'Imports a content bundle (packages/shared/src/content/bundle.ts). service_role only.';

revoke all on function content_private.import_bundle(jsonb) from public, anon, authenticated;
grant execute on function content_private.import_bundle(jsonb) to service_role;
