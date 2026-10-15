-- Spec 10 §2/§6: notification prefs, push subscriptions, the inbox, generate_due_notifications (time zone
-- window, quiet hours, remind_days, max_per_day, backoff levels, activity, priority, weekly summary,
-- idempotency), ignore/click/activity backoff, retention and privileges.
-- Calendar used below: 2026-10-12 Mon, 14 Wed, 15 Thu, 16 Fri, 17 Sat, 18 Sun, 19 Mon. Asia/Ho_Chi_Minh is
-- UTC+7 (19:30 local = 12:30Z); America/New_York is UTC-4 in October (08:00 local = 12:00Z).
begin;
create extension if not exists pgtap with schema extensions;
select plan(155);

create function pg_temp.u(i integer) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.gen(p_now text) returns jsonb language sql as $$
  select public.generate_due_notifications(p_now::timestamptz);
$$;
-- Notifications of learner i (optionally one kind / one local day).
create function pg_temp.n(i integer, p_kind text default null, p_day text default null) returns integer language sql as $$
  select count(*)::integer from public.notifications n
  where n.user_id = pg_temp.u(i) and (p_kind is null or n.kind = p_kind) and (p_day is null or n.local_day = p_day::date);
$$;
create function pg_temp.kinds(i integer, p_day text) returns text[] language sql as $$
  select coalesce(array_agg(n.kind order by n.created_at, n.kind), '{}') from public.notifications n
  where n.user_id = pg_temp.u(i) and n.local_day = p_day::date;
$$;
create function pg_temp.prefs(i integer) returns public.notification_prefs language sql as $$
  select * from public.notification_prefs where user_id = pg_temp.u(i);
$$;
create function pg_temp.path(i integer, p_minutes integer) returns uuid language sql as $$
  select pg_temp.as_user(pg_temp.u(i));
  select (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array_fill(p_minutes::smallint, array[7]))).id;
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(i), 'n1-' || i || '@test.dev', '{}' from generate_series(1, 20) as i;
update public.profiles set timezone = 'America/New_York' where id = pg_temp.u(2);

-- ===== Schema and privileges =====
select has_table('public', 'notification_prefs', 'notification_prefs exists');
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select has_table('public', 'notifications', 'notifications exists');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('notification_prefs', 'push_subscriptions', 'notifications') and c.relrowsecurity), 3,
  'RLS enabled on the 3 tables');
select ok(has_table_privilege('authenticated', 'public.notifications', 'select'), 'learners can read the inbox (RLS)');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert'), 'learners cannot insert notifications');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'update'), 'learners cannot update notifications directly');
select ok(not has_table_privilege('authenticated', 'public.notification_prefs', 'update'), 'learners cannot update prefs directly');
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'insert'), 'learners cannot insert subscriptions directly');
select ok(not has_table_privilege('anon', 'public.notifications', 'select'), 'anon cannot read notifications');
select ok(has_table_privilege('service_role', 'public.push_subscriptions', 'update'), 'service_role updates subscriptions (dispatch)');
select ok(has_table_privilege('service_role', 'public.notifications', 'update'), 'service_role updates notifications (dispatch)');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proconfig @> array['search_path=""']
    and p.proname in ('get_notification_prefs', 'set_notification_prefs', 'save_push_subscription', 'delete_push_subscription',
      'mark_notification', 'list_notifications', 'unread_notification_count', 'generate_due_notifications', 'purge_notifications')), 9,
  'the 9 RPCs are security definer with search_path=''''');
select ok(not has_function_privilege('authenticated', 'public.generate_due_notifications(timestamptz)', 'execute'), 'learners cannot generate');
select ok(not has_function_privilege('anon', 'public.generate_due_notifications(timestamptz)', 'execute'), 'anon cannot generate');
select ok(has_function_privilege('service_role', 'public.generate_due_notifications(timestamptz)', 'execute'), 'service_role can generate');
select ok(not has_function_privilege('authenticated', 'public.purge_notifications()', 'execute'), 'learners cannot purge');
select ok(has_function_privilege('service_role', 'public.purge_notifications()', 'execute'), 'service_role can purge');
select ok(not has_function_privilege('anon', 'public.get_notification_prefs()', 'execute'), 'anon cannot read prefs');
select ok(not has_function_privilege('authenticated', 'public.reminders_weekly_payload(uuid, date)', 'execute'), 'helpers are internal');
select ok(has_function_privilege('authenticated', 'public.list_notifications(integer, timestamptz)', 'execute'), 'learners can list');

set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select throws_ok('select public.generate_due_notifications(now())', '42501', null, 'learner: generate denied');
select throws_ok('select public.purge_notifications()', '42501', null, 'learner: purge denied');
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok('select public.get_notification_prefs()', '42501', 'not_authenticated', 'prefs need a user');
select throws_ok('select public.list_notifications()', '42501', 'not_authenticated', 'list needs a user');
reset role;
set local role anon;
select throws_ok('select public.unread_notification_count()', '42501', null, 'anon: unread count denied');
reset role;

-- ===== Prefs =====
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select is(public.get_notification_prefs(),
  '{"reminders_enabled": false, "remind_at": "19:30", "remind_days": [1,2,3,4,5,6,7], "quiet_start": "22:00",
    "quiet_end": "07:00", "max_per_day": 1, "weekly_summary": true, "push_enabled": false, "ignored_streak": 0,
    "backoff_level": 0}'::jsonb, 'get_notification_prefs creates and returns the defaults');
select is((select count(*)::integer from public.notification_prefs), 1, 'the default row exists and is readable by its owner');
select is(public.set_notification_prefs('{"reminders_enabled": true, "push_enabled": true}') ->> 'reminders_enabled', 'true',
  'set_notification_prefs applies a partial patch');
select is((public.get_notification_prefs() ->> 'push_enabled')::boolean, true, 'the patch persisted');
select throws_ok($$select public.set_notification_prefs('{"remind_at": "25:00"}')$$, 'P0001', 'invalid_prefs', 'bad remind_at');
select throws_ok($$select public.set_notification_prefs('{"quiet_start": "7:00"}')$$, 'P0001', 'invalid_prefs', 'time needs HH:MM');
select throws_ok($$select public.set_notification_prefs('{"max_per_day": 4}')$$, 'P0001', 'invalid_prefs', 'max_per_day above 3');
select throws_ok($$select public.set_notification_prefs('{"max_per_day": 0}')$$, 'P0001', 'invalid_prefs', 'max_per_day below 1');
select throws_ok($$select public.set_notification_prefs('{"remind_days": [0, 3]}')$$, 'P0001', 'invalid_prefs', 'day 0 rejected');
select throws_ok($$select public.set_notification_prefs('{"remind_days": "1,2"}')$$, 'P0001', 'invalid_prefs', 'remind_days must be an array');
select throws_ok($$select public.set_notification_prefs('{"reminders_enabled": null}')$$, 'P0001', 'invalid_prefs', 'null rejected');
select throws_ok($$select public.set_notification_prefs('{"ignored_streak": 0}')$$, 'P0001', 'invalid_prefs', 'read-only field rejected');
select throws_ok($$select public.set_notification_prefs('[]')$$, 'P0001', 'invalid_prefs', 'patch must be an object');
select pg_temp.as_user(pg_temp.u(20));
select is(public.set_notification_prefs('{"remind_days": [5, 1, 5]}') -> 'remind_days', '[1, 5]'::jsonb, 'days are sorted and distinct');
select is(public.set_notification_prefs('{"reminders_enabled": true, "remind_days": []}') ->> 'reminders_enabled', 'false',
  'no day left turns reminders off');
select is(public.set_notification_prefs('{"reminders_enabled": true}') ->> 'reminders_enabled', 'false',
  'reminders stay off while no day is selected');
select is(public.set_notification_prefs('{"remind_at": "06:45", "quiet_start": "23:00", "quiet_end": "06:00", "max_per_day": 3, "weekly_summary": false}'),
  '{"reminders_enabled": false, "remind_at": "06:45", "remind_days": [], "quiet_start": "23:00", "quiet_end": "06:00",
    "max_per_day": 3, "weekly_summary": false, "push_enabled": false, "ignored_streak": 0, "backoff_level": 0}'::jsonb,
  'set returns the full prefs row');
reset role;

-- ===== Push subscriptions: 5-device cap, validation, ownership =====
set local role authenticated;
select pg_temp.as_user(pg_temp.u(20));
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/u20-' || i, 'BKey' || i, 'auth' || i, 'Mozilla/5.0 ' || repeat('x', 300))
from generate_series(1, 7) as i;
select is((select count(*)::integer from public.push_subscriptions), 5, 'at most 5 subscriptions per learner');
select is((select array_agg(endpoint order by endpoint) from public.push_subscriptions),
  array['https://fcm.googleapis.com/fcm/send/u20-3', 'https://fcm.googleapis.com/fcm/send/u20-4', 'https://fcm.googleapis.com/fcm/send/u20-5', 'https://fcm.googleapis.com/fcm/send/u20-6', 'https://fcm.googleapis.com/fcm/send/u20-7'],
  'the oldest subscriptions were evicted');
select is((select max(char_length(user_agent)) from public.push_subscriptions), 200, 'user_agent truncated to 200');
select throws_ok($$select public.save_push_subscription('http://fcm.googleapis.com/fcm/send/x', 'k', 'a', null)$$, 'P0001', 'invalid_subscription', 'https endpoint required');
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'bad key', 'a', null)$$, 'P0001', 'invalid_subscription', 'p256dh must be base64url');
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'k', null, null)$$, 'P0001', 'invalid_subscription', 'auth required');
select public.delete_push_subscription('https://fcm.googleapis.com/fcm/send/u20-3');
select is((select count(*)::integer from public.push_subscriptions), 4, 'delete_push_subscription removes the endpoint');
select pg_temp.as_user(pg_temp.u(2));
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/u20-7', 'BNew', 'anew', null);
select public.delete_push_subscription('https://fcm.googleapis.com/fcm/send/u20-4');
select is((select array_agg(endpoint) from public.push_subscriptions), array['https://fcm.googleapis.com/fcm/send/u20-7'],
  'B sees only its own subscription; an endpoint re-saved by another account moves to it');
reset role;
select is((select count(*)::integer from public.push_subscriptions where user_id = pg_temp.u(20)), 3,
  'B could not delete A''s subscription; the moved endpoint left A');

-- u1: VN 19:30, push on with a device. Everyone else is configured directly.
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/u1', 'BKeyU1', 'authU1', 'Firefox');
reset role;

insert into public.notification_prefs (user_id, reminders_enabled, remind_at, remind_days, quiet_start, quiet_end, max_per_day, push_enabled, backoff_level, ignored_streak)
values
  (pg_temp.u(2),  true,  '08:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- New York; device but push off
  (pg_temp.u(3),  true,  '23:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- inside quiet hours past midnight
  (pg_temp.u(4),  true,  '07:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- right when quiet hours end
  (pg_temp.u(5),  true,  '12:30', '{1,2,3,4,5,6,7}', '12:00', '14:00', 1, false, 0, 0), -- daytime quiet hours
  (pg_temp.u(6),  true,  '19:30', '{1,2}',           '22:00', '07:00', 1, false, 0, 0), -- Mon/Tue only
  (pg_temp.u(7),  true,  '12:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 2, false, 0, 0), -- two a day
  (pg_temp.u(8),  true,  '12:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- one a day
  (pg_temp.u(9),  true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 1, 0), -- backoff 1
  (pg_temp.u(10), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 2, 0), -- backoff 2
  (pg_temp.u(11), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 3, 0), -- backoff 3
  (pg_temp.u(12), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- already active today
  (pg_temp.u(13), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- lesson in progress + due cards
  (pg_temp.u(14), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- due cards
  (pg_temp.u(15), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- weekly summary only
  (pg_temp.u(16), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true,  0, 0), -- weekly summary, pushed
  (pg_temp.u(17), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0), -- ignores reminders
  (pg_temp.u(18), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 2, 1), -- active, backed off
  (pg_temp.u(19), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false, 0, 0); -- active after the reminder
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (pg_temp.u(16), 'https://fcm.googleapis.com/fcm/send/u16', 'BKeyU16', 'authU16');

select set_config('test.p7', pg_temp.path(7, 30)::text, true);
select set_config('test.p12', pg_temp.path(12, 30)::text, true);
select set_config('test.p13', pg_temp.path(13, 30)::text, true);
select set_config('test.p14', pg_temp.path(14, 30)::text, true);
select set_config('test.p15', pg_temp.path(15, 30)::text, true);
select set_config('test.p16', pg_temp.path(16, 10)::text, true);
select set_config('test.p18', pg_temp.path(18, 30)::text, true);
select set_config('test.p19', pg_temp.path(19, 30)::text, true);
select set_config('request.jwt.claims', '', true);

-- u12 and u18 are active on Wednesday; u15 studied 10 minutes on two days of the week.
insert into public.activity_days (user_id, learning_path_id, local_day, lessons, active_ms) values
  (pg_temp.u(12), current_setting('test.p12')::uuid, '2026-10-14', 1, 600000),
  (pg_temp.u(18), current_setting('test.p18')::uuid, '2026-10-14', 1, 600000),
  (pg_temp.u(15), current_setting('test.p15')::uuid, '2026-10-13', 0, 600000),
  (pg_temp.u(15), current_setting('test.p15')::uuid, '2026-10-16', 0, 600000),
  (pg_temp.u(15), current_setting('test.p15')::uuid, '2026-10-05', 1, 3000000); -- previous week, not counted

-- u13: a lesson in progress (started Tuesday) and a due card; u7: one item due; u14: two items due.
select set_config('test.lesson', '69dc577d-a377-5093-af0f-9c23deb82650', true);
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, started_at)
values (pg_temp.u(13), current_setting('test.p13')::uuid, current_setting('test.lesson')::uuid, 1, '{}', '2026-10-13 10:00Z');
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, stability, difficulty, reps, due_at)
select x.uid, x.path, i.id, 'recognize', 'review', 3, 5, 2, '2026-10-10 00:00Z'
from (values (pg_temp.u(7), current_setting('test.p7')::uuid, 1), (pg_temp.u(13), current_setting('test.p13')::uuid, 1),
             (pg_temp.u(14), current_setting('test.p14')::uuid, 2)) as x (uid, path, n)
cross join lateral (
  select li.id from public.learning_items li where li.language_code = 'en' and li.status = 'published' order by li.id limit x.n
) as i;

-- u16: 24 first attempts on Wednesday, 2 minutes each: a lesson with listening/speaking/vocabulary at 0.25 and one
-- with grammar/vocabulary/writing at 1.0, so listening (dashboard order before speaking) is the weak skill.
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, started_at, status, completed_at, summary_json)
select pg_temp.u(16), current_setting('test.p16')::uuid, l, 1, '{}', '2026-10-14 02:00Z', 'completed', '2026-10-14 02:30Z', '{}'
from unnest(array['69dc577d-a377-5093-af0f-9c23deb82650', '28c72bd3-e8c2-5350-8395-12f93e0a3f42']::uuid[]) as l;
insert into public.attempts (user_id, learning_path_id, lesson_run_id, lesson_id, exercise_id, exercise_version, content_version,
  idempotency_key, payload_hash, response_json, verdict, is_correct, score, attempt_no, revealed, after_reveal, gave_up,
  feedback_json, stage, exercise_type, response_ms, hint_count, created_at)
select r.user_id, r.learning_path_id, r.id, r.lesson_id, e.id, e.version, 1, gen_random_uuid(), 'h', '{}',
  case when r.lesson_id = current_setting('test.lesson')::uuid then 'incorrect' else 'correct' end,
  r.lesson_id <> current_setting('test.lesson')::uuid,
  case when r.lesson_id = current_setting('test.lesson')::uuid then 0.25 else 1 end,
  1, false, false, false, '{}', e.stage, e.exercise_type, 120000, 0, timestamptz '2026-10-14 03:00Z' + g * interval '2 minutes'
from public.lesson_runs r
cross join generate_series(1, 12) as g
cross join lateral (select x.* from public.exercises x where x.lesson_id = r.lesson_id and x.status = 'published' order by x.order_index limit 1) as e
where r.user_id = pg_temp.u(16);

-- ===== Service role can run the generator; nobody is due at 03:00 VN / 16:00 New York =====
set local role service_role;
select is(public.generate_due_notifications('2026-10-13 20:00Z'), '[]'::jsonb, 'service_role runs the generator');
select is(public.purge_notifications() >= 0, true, 'service_role runs the purge');
reset role;

-- ===== Wednesday: activity relief, quiet hours, windows, max_per_day =====
select pg_temp.gen('2026-10-14 00:00Z'); -- 07:00 VN
select is(pg_temp.kinds(4, '2026-10-14'), array['quick_check'], 'a reminder fires when quiet hours end (07:00)');
select is((pg_temp.prefs(18)).backoff_level, 1::smallint, 'activity today lowers the backoff by one level');
select is((pg_temp.prefs(18)).ignored_streak, 0, 'activity today resets ignored_streak');
select pg_temp.gen('2026-10-14 00:10Z');
select is((pg_temp.prefs(18)).backoff_level, 1::smallint, 'activity lowers the backoff once per day');
select is(pg_temp.n(4), 1, 'a second run inside the same window adds nothing');

select pg_temp.gen('2026-10-14 05:00Z'); -- 12:00 VN
select is(pg_temp.kinds(7, '2026-10-14'), array['review_due'], 'max_per_day 2: the first slot sends the top-priority reminder');
select is(pg_temp.kinds(8, '2026-10-14'), array['quick_check'], 'max_per_day 1: one reminder at 12:00');
select pg_temp.gen('2026-10-14 05:30Z'); -- 12:30 VN
select is(pg_temp.n(5), 0, 'no reminder inside daytime quiet hours');
select pg_temp.gen('2026-10-14 08:00Z'); -- 15:00 VN, second slot
select is(pg_temp.kinds(7, '2026-10-14'), array['review_due', 'quick_check'], 'max_per_day 2: the second slot (+3 h) sends the next kind');
select is(pg_temp.n(8), 1, 'max_per_day 1: no second slot');
select pg_temp.gen('2026-10-14 11:00Z'); -- 18:00 VN, third slot
select is(pg_temp.n(7), 2, 'max_per_day 2: no third reminder');

-- ===== Time zones =====
select set_config('test.r_ny', pg_temp.gen('2026-10-14 12:00Z')::text, true); -- 08:00 New York, 19:00 VN
select is(pg_temp.kinds(2, '2026-10-14'), array['quick_check'], 'New York learner reminded at 08:00 local');
select is(pg_temp.n(1), 0, 'VN learner not reminded at 19:00 local');
select is(current_setting('test.r_ny')::jsonb, '[]'::jsonb, 'push_enabled off: inbox only, nothing to push');
select pg_temp.gen('2026-10-14 12:25Z');
select is(pg_temp.n(1), 0, 'not before remind_at');

select set_config('test.r1', pg_temp.gen('2026-10-14 12:30Z')::text, true); -- 19:30 VN
select is(pg_temp.kinds(1, '2026-10-14'), array['quick_check'], 'reminder at remind_at in the learner''s time zone');
select is(jsonb_array_length(current_setting('test.r1')::jsonb), 1, 'only learners with push on and a device are returned');
select is(current_setting('test.r1')::jsonb -> 0,
  (select jsonb_build_object('notification_id', n.id, 'user_id', n.user_id, 'title', n.title_vi, 'body', n.body_vi, 'url', n.action_url)
   from public.notifications n where n.user_id = pg_temp.u(1)),
  'push row is {notification_id, user_id, title, body, url}');
select is((select action_url from public.notifications where user_id = pg_temp.u(1)), '/app/phien-hoc?phut=10', 'quick_check opens a short session');
select is(pg_temp.gen('2026-10-14 12:30Z'), '[]'::jsonb, 'same p_now again pushes nothing');
select is((select count(*)::integer from public.notifications where local_day = '2026-10-14'),
  (select count(*)::integer from public.notifications where local_day = '2026-10-14' and created_at <= '2026-10-14 12:30Z'),
  'sanity: every Wednesday row predates the rerun');
select pg_temp.gen('2026-10-14 12:44Z');
select is(pg_temp.n(1), 1, 'same window later: no duplicate');
select pg_temp.gen('2026-10-14 12:45Z');
select is(pg_temp.n(1), 1, 'after the window: nothing');
select pg_temp.gen('2026-10-14 16:00Z'); -- 23:00 VN
select is(pg_temp.n(3), 0, 'no reminder inside quiet hours that cross midnight');
select is(pg_temp.n(6), 0, 'remind_days without Wednesday: nothing on Wednesday');

-- ===== Backoff levels on Wednesday =====
select is(pg_temp.n(9), 0, 'backoff 1 skips Wednesday');
select is(pg_temp.kinds(10, '2026-10-14'), array['quick_check'], 'backoff 2 keeps Wednesday');
select is(pg_temp.n(11), 0, 'backoff 3 skips Wednesday');

-- ===== Activity and priority =====
select is(pg_temp.n(12), 0, 'already active today: no reminder');
select is(pg_temp.kinds(13, '2026-10-14'), array['resume_lesson'], 'resume_lesson beats review_due');
select is((select action_url from public.notifications where user_id = pg_temp.u(13)),
  '/app/hoc-tap/bai/' || current_setting('test.lesson'), 'resume_lesson opens the lesson');
select is((select payload ->> 'lesson_id' from public.notifications where user_id = pg_temp.u(13)), current_setting('test.lesson'),
  'resume_lesson payload names the lesson');
select is(pg_temp.kinds(14, '2026-10-14'), array['review_due'], 'review_due when cards are due');
select is((select body_vi from public.notifications where user_id = pg_temp.u(14)), 'Có 2 thẻ đang chờ — ôn 5 phút là đủ.',
  'review_due body counts the due cards');
select is((select action_url from public.notifications where user_id = pg_temp.u(14)), '/app/on-tap', 'review_due opens the review');
select is(pg_temp.kinds(19, '2026-10-14'), array['quick_check'], 'u19 reminded before studying');
select is(pg_temp.n(15) + pg_temp.n(16), 0, 'reminders off: nothing on weekdays');

-- u19 studies on Wednesday evening after the reminder.
insert into public.activity_days (user_id, learning_path_id, local_day, lessons, active_ms)
values (pg_temp.u(19), current_setting('test.p19')::uuid, '2026-10-14', 1, 600000);

-- ===== Thursday =====
select pg_temp.gen('2026-10-15 12:30Z');
select is(pg_temp.n(9, null, '2026-10-15'), 1, 'backoff 1 keeps Thursday');
select is(pg_temp.n(10, null, '2026-10-15'), 0, 'backoff 2 skips Thursday');
select is(pg_temp.n(11, null, '2026-10-15'), 0, 'backoff 3 skips Thursday');
select is((pg_temp.prefs(17)).ignored_streak, 1, 'a reminder unclicked for 24 h counts as ignored');
select is((pg_temp.prefs(19)).ignored_streak, 0, 'not ignored when the learner studied that day');
select is((pg_temp.prefs(18)).backoff_level, 1::smallint, 'no activity on Thursday: backoff unchanged');
select is((select ignore_checked from public.notifications where user_id = pg_temp.u(17) and local_day = '2026-10-15'), false,
  'a fresh reminder is not judged yet');

-- ===== Friday, Saturday: three ignores raise the backoff =====
select pg_temp.gen('2026-10-16 12:30Z');
select is((pg_temp.prefs(17)).ignored_streak, 2, 'second ignore');
select is((pg_temp.prefs(17)).backoff_level, 0::smallint, 'two ignores: still level 0');
select pg_temp.gen('2026-10-17 12:30Z');
select is((pg_temp.prefs(17)).backoff_level, 1::smallint, 'third ignore raises the backoff level');
select is((pg_temp.prefs(17)).ignored_streak, 0, 'and resets the streak');
select is(pg_temp.n(17), 4, 'Saturday is allowed at level 1');

-- ===== Inbox RPCs (u17 has 4 reminders, Wed..Sat) =====
set local role authenticated;
select pg_temp.as_user(pg_temp.u(17));
select is(public.unread_notification_count(), 4, 'unread count');
select set_config('test.l1', public.list_notifications(2)::text, true);
select is(jsonb_array_length(current_setting('test.l1')::jsonb -> 'items'), 2, 'list honours p_limit');
select is((current_setting('test.l1')::jsonb ->> 'has_more')::boolean, true, 'has_more when older rows remain');
select is(current_setting('test.l1')::jsonb #>> '{items,0,local_day}', '2026-10-17', 'newest first');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('test.l1')::jsonb #> '{items,0}') as k),
  array['action_url', 'body_vi', 'clicked_at', 'created_at', 'id', 'kind', 'local_day', 'payload', 'read_at', 'title_vi'],
  'items carry exactly the notificationSchema fields');
select set_config('test.l2', public.list_notifications(2, (current_setting('test.l1')::jsonb #>> '{items,1,created_at}')::timestamptz)::text, true);
select is((select array_agg(e ->> 'local_day') from jsonb_array_elements(current_setting('test.l2')::jsonb -> 'items') as e),
  array['2026-10-15', '2026-10-14'], 'p_before pages to older rows');
select is((current_setting('test.l2')::jsonb ->> 'has_more')::boolean, false, 'last page: has_more false');
select is(public.list_notifications(100, '2026-01-01Z'), '{"items": [], "has_more": false}'::jsonb, 'empty page');
select public.mark_notification((current_setting('test.l2')::jsonb #>> '{items,1,id}')::uuid, 'read');
select is(public.unread_notification_count(), 3, 'mark read lowers the unread count');
select throws_ok(format('select public.mark_notification(%L, %L)', current_setting('test.l1')::jsonb #>> '{items,0,id}', 'opened'),
  'P0001', 'invalid_action', 'unknown action');
select throws_ok(format('select public.mark_notification(%L, %L)', gen_random_uuid(), 'read'),
  'P0001', 'notification_not_found', 'unknown notification');
select public.mark_notification((current_setting('test.l1')::jsonb #>> '{items,0,id}')::uuid, 'clicked');
select is((public.get_notification_prefs() ->> 'backoff_level')::integer, 0, 'a click lowers the backoff level');
select is(public.unread_notification_count(), 2, 'a click also marks read');
select ok((select clicked_at is not null and read_at is not null from public.notifications
  where id = (current_setting('test.l1')::jsonb #>> '{items,0,id}')::uuid), 'clicked_at and read_at set');

-- RLS A/B: u2 sees none of u17's rows and cannot mark them.
select pg_temp.as_user(pg_temp.u(2));
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u(17)), 0, 'RLS: other learners'' notifications hidden');
-- 4 = Wed 08:00 plus Thu/Fri/Sat caught up by the 12:30Z runs (08:30 New York is inside the 60-minute window).
select is((select count(*)::integer from public.notifications), 4, 'RLS: own notifications visible');
select is((select count(*)::integer from public.notification_prefs), 1, 'RLS: only own prefs visible');
select throws_ok(format('select public.mark_notification(%L, %L)', current_setting('test.l1')::jsonb #>> '{items,0,id}', 'read'),
  'P0001', 'notification_not_found', 'cannot mark another learner''s notification');
select throws_ok($$insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, local_day)
  values (auth.uid(), 'quick_check', 't', 'b', '/app/', current_date)$$, '42501', null, 'learners cannot insert notifications');
select throws_ok($$update public.notification_prefs set backoff_level = 0$$, '42501', null, 'learners cannot update prefs directly');
reset role;
select throws_ok($$insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, local_day)
  values ('10000000-0000-4000-8000-000000000001', 'quick_check', 't', 'b', 'https://evil.example/', '2026-10-01')$$,
  '23514', null, 'action_url must be an internal /app/ path');

-- ===== Sunday: weekly summary =====
select pg_temp.gen('2026-10-18 05:00Z'); -- 12:00 VN
select is(pg_temp.n(7, 'weekly_summary'), 1, 'weekly summary at the learner''s remind_at (12:00)');
select is(pg_temp.n(15, 'weekly_summary'), 0, 'no weekly summary before remind_at (19:30)');
select set_config('test.rs', pg_temp.gen('2026-10-18 12:30Z')::text, true);
select is(pg_temp.n(15, 'weekly_summary'), 1, 'weekly summary with reminders off');
select is((select payload from public.notifications where user_id = pg_temp.u(15) and kind = 'weekly_summary'),
  '{"week_start": "2026-10-12", "minutes": 20, "planned_minutes": 210, "active_days": 2, "planned_days": 7,
    "weak_skill": null, "weak_accuracy": null,
    "suggestion_vi": "Thử giảm mục tiêu xuống 5 phút/ngày — vừa sức thì dễ duy trì hơn."}'::jsonb,
  'payload: minutes and sessions against the plan, a lighter goal when under half');
select is((select body_vi from public.notifications where user_id = pg_temp.u(15) and kind = 'weekly_summary'),
  'Tuần này bạn học 20 phút, 2/7 buổi theo kế hoạch (mục tiêu 210 phút). Thử giảm mục tiêu xuống 5 phút/ngày — vừa sức thì dễ duy trì hơn.',
  'weekly body');
select is((select title_vi || ' ' || action_url from public.notifications where user_id = pg_temp.u(15) and kind = 'weekly_summary'),
  'Báo cáo tuần của bạn /app/tien-do', 'weekly title and link to the progress page');
select is((select payload - 'weak_accuracy' from public.notifications where user_id = pg_temp.u(16) and kind = 'weekly_summary'),
  '{"week_start": "2026-10-12", "minutes": 48, "planned_minutes": 70, "active_days": 1, "planned_days": 7,
    "weak_skill": "listening", "suggestion_vi": "Thêm 1 buổi luyện Nghe vào tuần tới."}'::jsonb,
  'payload: weakest skill with enough samples and a matching suggestion');
select is((select (payload ->> 'weak_accuracy')::numeric from public.notifications where user_id = pg_temp.u(16) and kind = 'weekly_summary'),
  0.25, 'weak_accuracy is the first-try accuracy');
select is((select body_vi from public.notifications where user_id = pg_temp.u(16) and kind = 'weekly_summary'),
  'Tuần này bạn học 48 phút, 1/7 buổi theo kế hoạch (mục tiêu 70 phút). Kỹ năng nên luyện thêm: Nghe (25% đúng). Thêm 1 buổi luyện Nghe vào tuần tới.',
  'weekly body names the weak skill');
select is((select array_agg(e ->> 'url' order by e ->> 'url') from jsonb_array_elements(current_setting('test.rs')::jsonb) as e
  where (e ->> 'user_id')::uuid = pg_temp.u(16)), array['/app/tien-do'], 'weekly summary is pushed to learners with a device');
select is(pg_temp.n(17, null, '2026-10-18'), 1, 'after a click lowered the backoff to 0, Sunday reminders resume');
select is(pg_temp.n(20), 0, 'no learning path: no weekly summary');
select is((select count(*)::integer from public.notifications where kind = 'weekly_summary' and local_day <> '2026-10-18'), 0,
  'weekly summaries only on Sunday');
select is((select count(*)::integer from public.notifications where kind = 'weekly_summary'),
  (select count(distinct user_id)::integer from public.learning_paths where user_id in (select pg_temp.u(i) from generate_series(1, 20) as i)),
  'one weekly summary per learner with a path');
select pg_temp.gen('2026-10-18 12:35Z');
select is(pg_temp.n(15, 'weekly_summary'), 1, 'weekly summary is not duplicated');
select is((pg_temp.prefs(17)).ignored_streak, 0, 'a clicked reminder is not counted as ignored');

-- ===== Monday =====
select pg_temp.gen('2026-10-19 12:30Z');
select is(pg_temp.kinds(6, '2026-10-19'), array['quick_check'], 'remind_days with Monday: reminded on Monday');
select is(pg_temp.n(11, null, '2026-10-19'), 1, 'backoff 3 keeps Monday');

-- reset_backoff
update public.notification_prefs set backoff_level = 2, ignored_streak = 2 where user_id = pg_temp.u(11);
set local role authenticated;
select pg_temp.as_user(pg_temp.u(11));
select is(public.set_notification_prefs('{"reset_backoff": true}') -> 'backoff_level', '0'::jsonb, 'reset_backoff clears the level');
select is((public.get_notification_prefs() ->> 'ignored_streak')::integer, 0, 'reset_backoff clears the streak');
select is(public.set_notification_prefs('{"reset_backoff": false}') -> 'reminders_enabled', 'true'::jsonb, 'reset_backoff false changes nothing');

-- ===== Export includes the reminder data =====
select pg_temp.as_user(pg_temp.u(1));
select set_config('test.x', public.export_my_data()::text, true);
reset role;
select is(jsonb_array_length(current_setting('test.x')::jsonb -> 'notifications'), pg_temp.n(1), 'export includes the inbox');
select is(current_setting('test.x')::jsonb #>> '{notification_prefs,0,user_id}', pg_temp.u(1)::text, 'export includes the prefs');
select ok(not (current_setting('test.x')::jsonb ? 'push_subscriptions'), 'export leaves out push keys');

-- ===== Copy is free of guilt =====
select is((select count(*)::integer from public.notifications n,
    unnest(array['lười', 'bỏ lỡ', 'phá chuỗi', 'mất chuỗi', 'thất vọng', 'đáng xấu hổ', 'đừng bỏ cuộc']) as w
  where lower(n.title_vi || ' ' || n.body_vi || ' ' || n.payload::text) like '%' || w || '%'), 0, 'no forbidden phrase in generated copy');
select is((select count(*)::integer from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace,
    unnest(array['lười', 'bỏ lỡ', 'phá chuỗi', 'mất chuỗi', 'thất vọng', 'đáng xấu hổ', 'đừng bỏ cuộc']) as w
  where ns.nspname = 'public' and (p.proname like 'reminders_%' or p.proname = 'generate_due_notifications')
    and lower(p.prosrc) like '%' || w || '%'), 0, 'no forbidden phrase in the reminder functions');
select ok((select bool_and(char_length(title_vi) <= 80 and char_length(body_vi) <= 300) from public.notifications), 'copy within limits');

-- ===== Retention =====
insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, local_day, created_at)
values (pg_temp.u(1), 'quick_check', 'Cũ', 'Cũ', '/app/', (now() - interval '91 days')::date, now() - interval '91 days'),
       (pg_temp.u(1), 'review_due', 'Mới', 'Mới', '/app/', (now() - interval '89 days')::date, now() - interval '89 days');
set local role service_role;
select ok(public.purge_notifications() >= 1, 'purge reports deleted rows');
reset role;
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u(1) and title_vi = 'Cũ'), 0, 'rows older than 90 days purged');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u(1) and title_vi = 'Mới'), 1, 'rows within 90 days kept');

-- ===== Account deletion cascades =====
delete from auth.users where id = pg_temp.u(1);
select is((select count(*)::integer from public.notifications where user_id = pg_temp.u(1))
  + (select count(*)::integer from public.notification_prefs where user_id = pg_temp.u(1))
  + (select count(*)::integer from public.push_subscriptions where user_id = pg_temp.u(1)), 0, 'deleting the account removes reminder data');

select * from finish();
rollback;
