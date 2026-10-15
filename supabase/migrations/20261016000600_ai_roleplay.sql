-- Linguo spec 8.2 #6: the `roleplay_turn` AI task (conversation partner) joins AI_TASKS in
-- packages/shared/src/ai/contract.ts. The AI tables and the service-role RPCs allow-list task names, so they are
-- widened here (same shape as 20261016000200); nothing else changes. roleplay_turn is never cached, but ai_cache
-- accepts every known task so the four lists stay identical.

alter table public.ai_cache drop constraint ai_cache_task_check;
alter table public.ai_cache add constraint ai_cache_task_check
  check (task in ('explain_concept', 'generate_practice', 'analyze_error', 'review_writing',
    'analyze_sentence', 'summarize_session', 'plan_review', 'roleplay_turn'));

alter table public.ai_usage drop constraint ai_usage_task_check;
alter table public.ai_usage add constraint ai_usage_task_check
  check (task in ('explain_concept', 'generate_practice', 'analyze_error', 'review_writing',
    'analyze_sentence', 'summarize_session', 'plan_review', 'roleplay_turn'));

alter table public.ai_reports drop constraint ai_reports_task_check;
alter table public.ai_reports add constraint ai_reports_task_check
  check (task in ('explain_concept', 'generate_practice', 'analyze_error', 'review_writing',
    'analyze_sentence', 'summarize_session', 'plan_review', 'roleplay_turn'));

-- Same bodies as in 20261016000200, with roleplay_turn added to the list. `create or replace` keeps the
-- service_role-only EXECUTE grants.

-- Stores (or replaces) an entry for 30 days and drops expired entries. Service role only: entries are
-- shared across users, so only the Edge Function may write validated outputs.
create or replace function public.ai_cache_put(
  p_key text, p_task text, p_prompt_version text, p_model text, p_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_key';
  end if;
  if p_task is null or p_task not in ('explain_concept', 'generate_practice', 'analyze_error', 'review_writing',
       'analyze_sentence', 'summarize_session', 'plan_review', 'roleplay_turn') then
    raise exception using errcode = '22023', message = 'invalid_task';
  end if;
  if p_prompt_version is null or char_length(p_prompt_version) not between 1 and 32
     or p_model is null or char_length(p_model) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_argument';
  end if;
  if p_payload is null then
    raise exception using errcode = '22023', message = 'invalid_payload';
  end if;
  if octet_length(p_payload::text) > 16384 then
    raise exception using errcode = '22023', message = 'payload_too_large';
  end if;

  delete from public.ai_cache c where c.expires_at <= now();

  insert into public.ai_cache as c (key, task, prompt_version, model, payload, created_at, expires_at, hits)
  values (p_key, p_task, p_prompt_version, p_model, p_payload, now(), now() + interval '30 days', 0)
  on conflict (key) do update
    set task = excluded.task, prompt_version = excluded.prompt_version, model = excluded.model,
        payload = excluded.payload, created_at = excluded.created_at, expires_at = excluded.expires_at, hits = 0;
end;
$$;

-- Records one request (metadata only) for p_user_id and drops rows older than 90 days. Returns the row id,
-- which the function hands to the client as response_id. Service role only.
create or replace function public.ai_usage_log(
  p_user_id uuid, p_task text, p_prompt_version text, p_model text, p_status text, p_http_status integer,
  p_latency_ms integer, p_attempts integer, p_input_chars integer, p_cached boolean, p_repaired boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = '22023', message = 'invalid_user';
  end if;
  if p_task is null or p_task not in ('explain_concept', 'generate_practice', 'analyze_error', 'review_writing',
       'analyze_sentence', 'summarize_session', 'plan_review', 'roleplay_turn') then
    raise exception using errcode = '22023', message = 'invalid_task';
  end if;
  if p_prompt_version is null or char_length(p_prompt_version) not between 1 and 32
     or p_model is null or char_length(p_model) not between 1 and 100
     or p_status is null or p_status !~ '^[a-z_]{1,32}$'
     or (p_http_status is not null and p_http_status not between 100 and 599)
     or coalesce(p_latency_ms, 0) not between 0 and 600000
     or coalesce(p_attempts, 0) not between 0 and 10
     or coalesce(p_input_chars, 0) not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'invalid_argument';
  end if;

  delete from public.ai_usage u where u.created_at < now() - interval '90 days';

  insert into public.ai_usage (user_id, task, prompt_version, model, status, http_status, latency_ms, attempts,
    input_chars, cached, repaired)
  values (p_user_id, p_task, p_prompt_version, p_model, p_status, p_http_status, coalesce(p_latency_ms, 0),
    coalesce(p_attempts, 0), coalesce(p_input_chars, 0), coalesce(p_cached, false), coalesce(p_repaired, false))
  returning id into v_id;
  return v_id;
end;
$$;
