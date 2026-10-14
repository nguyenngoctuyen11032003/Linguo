-- Linguo spec 11 §3 ("Lưu ý trạng thái nội dung"): the content import never undoes a review decision taken in
-- the admin pages while the content itself is unchanged.
--
-- content_private.import_bundle (20261014000100_content.sql) copies the bundle's status onto rows whose
-- content_hash did not change. Once staff move rows through the workflow with admin_set_status (spec 11), the
-- repo YAML can lag behind the database: the YAML may still say `approved` for a row a reviewer has
-- published, or `published` for a row sent back to `in_review`. Re-importing would then try to downgrade
-- `published` or fail the whole import with invalid_status_transition.
--
-- Precedence for a row whose content_hash is unchanged and which is not archived: the bundle's review state
-- (status, is_demo, reviewed_by, reviewed_at) is applied only when its status equals the stored one or is one
-- legal workflow step away from it (public.content_status_transition); otherwise the stored state is kept and
-- the row counts as unchanged. So an import never moves a `published` row to draft / in_review / approved
-- (archiving, by status or by absence from the bundle, still works). Archived rows and rows whose content
-- changed are imported exactly as before: new content needs the review state written in the YAML.
--
-- The diagnostic and exam imports (import_diagnostic_bundle, import_exam_bundle) only ever move rows up to
-- `published`, so they are unchanged. The body below is import_bundle from 20261014000100_content.sql with one
-- extra branch per entity table (marked "Keep review state"). Never edit a deployed migration.

-- True when an import may move a row from p_from to p_to (no change, or one legal workflow step).
create or replace function content_private.import_status_step_ok(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to
    or (p_from, p_to) in (
      ('draft', 'in_review'), ('in_review', 'draft'), ('in_review', 'approved'), ('approved', 'published'),
      ('approved', 'draft'), ('published', 'archived'), ('archived', 'draft'));
$$;

revoke all on function content_private.import_status_step_ok(text, text) from public, anon, authenticated;

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
  -- An empty lesson list would archive every lesson; refuse it while anything is published.
  if jsonb_array_length(p_bundle -> 'lessons') = 0
     and exists (select 1 from public.lessons where status = 'published') then
    raise exception using errcode = 'P0001', message = 'empty_bundle';
  end if;
  -- Concurrent imports would interleave their archive/park/upsert steps; run them one at a time.
  perform pg_advisory_xact_lock(hashtext('linguo_content_import'));
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
    elsif v_src.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_src.status <> 'archived' and not content_private.import_status_step_ok(v_src.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
    elsif v_prog.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_prog.status <> 'archived' and not content_private.import_status_step_ok(v_prog.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.program_id, t.order_index) is distinct from ((x ->> 'program_id')::uuid, (x ->> 'order_index')::integer);
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
    elsif v_unit.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_unit.status <> 'archived' and not content_private.import_status_step_ok(v_unit.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
    elsif v_item.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_item.status <> 'archived' and not content_private.import_status_step_ok(v_item.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.unit_id, t.order_index) is distinct from ((x ->> 'unit_id')::uuid, (x ->> 'order_index')::integer);
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
    elsif v_lesson.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_lesson.status <> 'archived' and not content_private.import_status_step_ok(v_lesson.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
  where t.id = (x ->> 'id')::uuid and t.content_hash is distinct from x ->> 'content_hash'
    and (t.lesson_id, t.order_index) is distinct from ((x ->> 'lesson_id')::uuid, (x ->> 'order_index')::integer);
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
    elsif v_ex.content_hash is distinct from r ->> 'content_hash' then
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
    elsif v_ex.status <> 'archived' and not content_private.import_status_step_ok(v_ex.status, r ->> 'status') then
      -- Keep review state: the stored status (e.g. published by a reviewer) wins over a stale YAML status.
      v_unch := v_unch + 1;
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
