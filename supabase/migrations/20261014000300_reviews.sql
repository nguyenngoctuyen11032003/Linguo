-- Linguo spec 3 §2–3: review (flashcard) schema — FSRS parameters, cards, item mastery and the review log.
-- Clients read their own cards/mastery/logs through RLS and write only through the SECURITY DEFINER RPCs
-- of the later reviews migrations; srs_config is server-only.

-- ---------------------------------------------------------------------------
-- FSRS parameters (single row)
-- ---------------------------------------------------------------------------
create table public.srs_config (
  id boolean primary key default true check (id),
  -- FSRS-6 weights w0..w20.
  weights double precision[] not null,
  desired_retention double precision not null default 0.9,
  maximum_interval integer not null default 365,
  learning_steps_minutes integer[] not null default '{1,10}',
  relearning_steps_minutes integer[] not null default '{10}',
  -- New cards a learner may start per local day.
  daily_new_limit integer not null default 10,
  -- Daily review cap = clamp(weekly_minutes[today] * cap_per_minute, cap_min, cap_max).
  cap_min integer not null default 15,
  cap_max integer not null default 150,
  cap_per_minute integer not null default 3,
  -- Recovery mode (no new cards) when the due backlog exceeds recovery_factor * daily cap.
  recovery_factor double precision not null default 2,
  -- Mastery: >= mastery_min_successes successful recalls on >= mastery_min_days distinct local days and
  -- recall-direction stability >= mastery_min_recall_stability days.
  mastery_min_successes integer not null default 3,
  mastery_min_days integer not null default 3,
  mastery_min_recall_stability double precision not null default 21,
  updated_at timestamptz not null default now(),
  constraint srs_config_weights_shape check (
    coalesce(array_ndims(weights), 0) = 1 and array_length(weights, 1) = 21 and array_position(weights, null) is null
  ),
  constraint srs_config_desired_retention_range check (desired_retention > 0 and desired_retention < 1),
  constraint srs_config_maximum_interval_positive check (maximum_interval >= 1),
  constraint srs_config_learning_steps_shape check (
    coalesce(array_ndims(learning_steps_minutes), 1) = 1 and array_position(learning_steps_minutes, null) is null
    and 0 < all (learning_steps_minutes)
  ),
  constraint srs_config_relearning_steps_shape check (
    coalesce(array_ndims(relearning_steps_minutes), 1) = 1 and array_position(relearning_steps_minutes, null) is null
    and 0 < all (relearning_steps_minutes)
  ),
  constraint srs_config_daily_new_limit_range check (daily_new_limit >= 0),
  constraint srs_config_caps check (cap_min >= 0 and cap_max >= cap_min and cap_per_minute >= 0),
  constraint srs_config_recovery_factor_positive check (recovery_factor > 0),
  constraint srs_config_mastery_range check (
    mastery_min_successes >= 1 and mastery_min_days >= 1 and mastery_min_recall_stability >= 0
  )
);

comment on table public.srs_config is 'Single-row FSRS-6 scheduling parameters. weights are the ts-fsrs 5.x default_w (enable_fuzz off).';

create trigger srs_config_set_updated_at
  before update on public.srs_config
  for each row execute function public.set_updated_at();

-- ts-fsrs 5.4.2 default_w (FSRS-6). Must equal params.weights in packages/shared/src/review/fsrs.fixtures.json.
insert into public.srs_config (weights) values (array[
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
]::double precision[]);

-- ---------------------------------------------------------------------------
-- Review cards: one per (learner, path, learning item, direction)
-- ---------------------------------------------------------------------------
create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  learning_item_id uuid not null references public.learning_items (id) on delete restrict,
  direction text not null check (direction in ('recognize', 'recall')),
  fsrs_state text not null default 'new' check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  -- Index into learning/relearning steps while in those states.
  step smallint not null default 0 check (step >= 0),
  -- Null (or 0) while the card is new.
  stability double precision check (stability >= 0),
  difficulty double precision check (difficulty >= 0 and difficulty <= 10),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  due_at timestamptz not null,
  last_review_at timestamptz,
  suspended_at timestamptz,
  postpone_count smallint not null default 0 check (postpone_count >= 0),
  last_postponed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, learning_path_id, learning_item_id, direction)
);

create index review_cards_due_idx on public.review_cards (user_id, learning_path_id, due_at) where suspended_at is null;
create index review_cards_learning_path_id_idx on public.review_cards (learning_path_id);
create index review_cards_learning_item_id_idx on public.review_cards (learning_item_id);

create trigger review_cards_set_updated_at
  before update on public.review_cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Item mastery (per learning item, across both directions)
-- ---------------------------------------------------------------------------
create table public.review_item_mastery (
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  learning_item_id uuid not null references public.learning_items (id) on delete restrict,
  mastered_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, learning_path_id, learning_item_id)
);

create index review_item_mastery_learning_path_id_idx on public.review_item_mastery (learning_path_id);
create index review_item_mastery_learning_item_id_idx on public.review_item_mastery (learning_item_id);

create trigger review_item_mastery_set_updated_at
  before update on public.review_item_mastery
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Review log (append-only)
-- ---------------------------------------------------------------------------
create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  -- Required for grades; a postpone log may summarise several cards in one row.
  card_id uuid references public.review_cards (id) on delete cascade,
  kind text not null check (kind in ('grade', 'postpone')),
  rating_raw smallint check (rating_raw between 1 and 4),
  rating_effective smallint check (rating_effective between 1 and 4),
  confidence smallint check (confidence between 1 and 3),
  response_ms integer check (response_ms >= 0),
  hint_count smallint check (hint_count >= 0),
  state_before jsonb,
  state_after jsonb,
  -- Learner's local date (profiles.timezone) at the time of the event.
  local_day date not null,
  idempotency_key uuid not null,
  payload_hash text not null,
  -- RPC result stored for idempotent replays.
  result jsonb,
  client_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_logs_grade_shape check (
    kind <> 'grade' or (card_id is not null and rating_raw is not null and rating_effective is not null)
  ),
  unique (user_id, idempotency_key)
);

create index review_logs_user_path_created_idx on public.review_logs (user_id, learning_path_id, created_at desc);
create index review_logs_user_created_idx on public.review_logs (user_id, created_at desc);
create index review_logs_card_id_idx on public.review_logs (card_id);
create index review_logs_learning_path_id_idx on public.review_logs (learning_path_id);

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------
alter table public.srs_config enable row level security;
alter table public.review_cards enable row level security;
alter table public.review_item_mastery enable row level security;
alter table public.review_logs enable row level security;

-- srs_config: no policy, no grant (server-only).
create policy "review cards: read own" on public.review_cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "review item mastery: read own" on public.review_item_mastery
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "review logs: read own" on public.review_logs
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.srs_config, public.review_cards, public.review_item_mastery, public.review_logs from anon, authenticated;
grant select on public.review_cards, public.review_item_mastery, public.review_logs to authenticated;
