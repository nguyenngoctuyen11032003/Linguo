-- Linguo spec 4 §3: import of the diagnostic item bank (content/diagnostic/<en|ko>/<skill>.yaml).
-- Bundle shape: packages/shared/src/diagnostic/authoring.ts diagnosticBundleSchema, built by
-- scripts/content/diagnostic.mjs. supabase/seed.sql calls content_private.import_diagnostic_bundle right
-- after content_private.import_bundle; `pnpm content:push` calls the public wrapper through PostgREST.
--
-- One transaction: archive bank rows absent from the bundle, then upsert by id (UUIDv5 of key):
-- insert (inserted); content_hash changed → rewrite, version + 1 (updated); only review state changed
-- (status, is_demo, reviewed_by, reviewed_at) → update those (updated); else unchanged. A row that
-- comes back after being archived (or was moved off `published` by hand) is walked through the
-- status workflow of public.content_status_transition (archived → draft → in_review → approved →
-- published). Items join the published diagnostic of their language (assessments.language_code +
-- assessment_type 'diagnostic').
create or replace function content_private.import_diagnostic_bundle(p_bundle jsonb)
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
  v_assessment uuid;
  v_status text;
  v_step text;
  r jsonb;
  v_item public.assessment_items;
begin
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
     or (p_bundle -> 'bundle_version') is distinct from '1'::jsonb
     or jsonb_typeof(p_bundle -> 'items') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_bundle';
  end if;
  -- An empty bank would archive every item; refuse it while anything is published.
  if jsonb_array_length(p_bundle -> 'items') = 0
     and exists (select 1 from public.assessment_items where status = 'published') then
    raise exception using errcode = 'P0001', message = 'empty_bundle';
  end if;
  perform pg_advisory_xact_lock(hashtext('linguo_diagnostic_import'));

  perform set_config('linguo.content_import', 'archive', true);
  update public.assessment_items set status = 'archived'
  where status <> 'archived'
    and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_bundle -> 'items') x);
  get diagnostics v_arch = row_count;
  perform set_config('linguo.content_import', '', true);

  for r in select value from jsonb_array_elements(p_bundle -> 'items') loop
    select a.id into v_assessment
    from public.assessments a
    where a.language_code = r ->> 'language_code' and a.assessment_type = 'diagnostic'
    order by a.is_published desc, a.version desc
    limit 1;
    if v_assessment is null then
      raise exception using errcode = 'P0001', message = 'assessment_not_found', detail = coalesce(r ->> 'language_code', 'null');
    end if;
    v_status := r ->> 'status';

    select * into v_item from public.assessment_items where id = (r ->> 'id')::uuid for update;
    if not found then
      insert into public.assessment_items (
        id, key, assessment_id, language_code, skill, level_code, difficulty, item_type, prompt, answer_key,
        explanation, key_confidence, status, is_demo, reviewed_by, reviewed_at, version, content_hash
      ) values (
        (r ->> 'id')::uuid, r ->> 'key', v_assessment, r ->> 'language_code', r ->> 'skill', r ->> 'level_code',
        (r ->> 'difficulty')::numeric, r ->> 'item_type', r -> 'prompt', r ->> 'answer_key',
        r -> 'explanation', r ->> 'key_confidence', v_status, (r ->> 'is_demo')::boolean,
        r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz, 1, r ->> 'content_hash'
      );
      v_ins := v_ins + 1;
      continue;
    end if;

    if v_item.status = v_status
       and v_item.content_hash is not distinct from r ->> 'content_hash'
       and v_item.assessment_id = v_assessment
       and (v_item.is_demo, v_item.reviewed_by, v_item.reviewed_at) is not distinct from
           ((r ->> 'is_demo')::boolean, r ->> 'reviewed_by', (r ->> 'reviewed_at')::timestamptz) then
      v_unch := v_unch + 1;
      continue;
    end if;

    -- Back from archived (or a hand-edited status): reopen as draft so content may change freely.
    if v_item.status <> v_status and v_item.status in ('archived', 'in_review', 'approved') then
      update public.assessment_items set status = 'draft' where id = v_item.id;
    end if;

    if v_item.content_hash is distinct from r ->> 'content_hash' or v_item.assessment_id <> v_assessment then
      -- Review fields first, so the content_status_transition check sees the new review with the bump.
      update public.assessment_items set
        key = r ->> 'key', assessment_id = v_assessment, language_code = r ->> 'language_code', skill = r ->> 'skill',
        level_code = r ->> 'level_code', difficulty = (r ->> 'difficulty')::numeric, item_type = r ->> 'item_type',
        prompt = r -> 'prompt', answer_key = r ->> 'answer_key', explanation = r -> 'explanation',
        key_confidence = r ->> 'key_confidence', is_demo = (r ->> 'is_demo')::boolean,
        reviewed_by = r ->> 'reviewed_by', reviewed_at = (r ->> 'reviewed_at')::timestamptz,
        content_hash = r ->> 'content_hash',
        version = version + case when content_hash is distinct from r ->> 'content_hash' then 1 else 0 end
      where id = v_item.id;
    else
      update public.assessment_items set
        is_demo = (r ->> 'is_demo')::boolean, reviewed_by = r ->> 'reviewed_by',
        reviewed_at = (r ->> 'reviewed_at')::timestamptz
      where id = v_item.id;
    end if;

    -- Walk the status workflow up to the bundle status (always 'published', diagnosticBundleSchema).
    select status into v_step from public.assessment_items where id = v_item.id;
    if v_status = 'published' and v_step <> 'published' then
      foreach v_step in array array['in_review', 'approved', 'published'] loop
        update public.assessment_items set status = v_step where id = v_item.id;
      end loop;
    end if;
    v_upd := v_upd + 1;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'archived', v_arch, 'unchanged', v_unch);
end;
$$;

comment on function content_private.import_diagnostic_bundle(jsonb) is
  'Imports the diagnostic item bank (packages/shared/src/diagnostic/authoring.ts diagnosticBundleSchema). service_role only.';

revoke all on function content_private.import_diagnostic_bundle(jsonb) from public, anon, authenticated;
grant execute on function content_private.import_diagnostic_bundle(jsonb) to service_role;

-- PostgREST entry point for `pnpm content:push`, like public.import_content_bundle: no logic of its own,
-- service_role only.
create or replace function public.import_diagnostic_content_bundle(p_bundle jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select content_private.import_diagnostic_bundle(p_bundle);
$$;

comment on function public.import_diagnostic_content_bundle(jsonb) is
  'PostgREST wrapper around content_private.import_diagnostic_bundle for the content importer. service_role only.';

revoke all on function public.import_diagnostic_content_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.import_diagnostic_content_bundle(jsonb) to service_role;
