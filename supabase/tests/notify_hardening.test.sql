-- Hardening of the reminders / Web Push system (20261016000400_notify_hardening.sql): push endpoint allowlist
-- (function, RPC, CHECK), save_push_subscription rate limit, hidden subscription keys, the 60-minute catch-up window
-- (late run delivers once, no duplicate, quiet hours still block, weekly summary), generic push text, the retryable
-- pickup pending_push_notifications and retention of the rate-limit bookkeeping.
-- Calendar: 2026-10-14 Wed, 2026-10-18 Sun. Asia/Ho_Chi_Minh is UTC+7 (the default time zone of a profile).
begin;
create extension if not exists pgtap with schema extensions;
select plan(103);

create function pg_temp.u(i integer) returns uuid language sql immutable as $$
  select ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.gen(p_now text) returns jsonb language sql as $$
  select public.generate_due_notifications(p_now::timestamptz);
$$;
-- Elements of generate_due_notifications output that belong to learner i.
create function pg_temp.out(p_out jsonb, i integer) returns jsonb language sql as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(p_out) e where (e ->> 'user_id')::uuid = pg_temp.u(i);
$$;
-- Elements of pending_push_notifications(p_now) that belong to learner i.
create function pg_temp.pend(p_now text, i integer) returns jsonb language sql as $$
  select pg_temp.out(public.pending_push_notifications(p_now::timestamptz, 1000), i);
$$;
create function pg_temp.n(i integer, p_kind text default null) returns integer language sql as $$
  select count(*)::integer from public.notifications n
  where n.user_id = pg_temp.u(i) and (p_kind is null or n.kind = p_kind);
$$;
create function pg_temp.path(i integer, p_minutes integer) returns uuid language sql as $$
  select pg_temp.as_user(pg_temp.u(i));
  select (public.create_learning_path('en', 'new', 'foundation', 'pre_a1', 'a2', array_fill(p_minutes::smallint, array[7]))).id;
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(i), 'nh-' || i || '@test.dev', '{}' from generate_series(1, 16) as i;

-- ===== 1. is_allowed_push_endpoint =====
select is_empty($$
  select u from unnest(array[
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://fcm.googleapis.com:443/wp/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://autopush.push.services.mozilla.com/wpush/v2/x',
    'https://db5p.notify.windows.com/?token=abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QAbc'
  ]) as u where not public.is_allowed_push_endpoint(u)
$$, 'real push service endpoints are allowed');
select is_empty($$
  select u from unnest(array[
    'https://push.example.com/abc',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilfcm.googleapis.com/x',
    'https://evil.com/fcm.googleapis.com/x',
    'https://notify.windows.com/x',
    'https://127.0.0.1/x',
    'https://10.0.0.5/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
    'https://localhost/x',
    'https://user@fcm.googleapis.com/x',
    'https://user:pw@fcm.googleapis.com/x',
    'https://fcm.googleapis.com@evil.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://fcm.googleapis.com:80/x',
    'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com',
    'https://fcm.googleapis.com./x',
    'https://fcm.googleapis.com\x',
    'https://fcm.googleapis.com/x y',
    ''
  ]) as u where public.is_allowed_push_endpoint(u)
$$, 'other hosts, IP literals, localhost, userinfo, ports, http and look-alikes are rejected');
select is(public.is_allowed_push_endpoint(null), false, 'null endpoint is not allowed');
select is(public.is_allowed_push_endpoint('https://fcm.googleapis.com/' || repeat('a', 2048)), false, 'over-long endpoint is not allowed');
select ok(not has_function_privilege('authenticated', 'public.is_allowed_push_endpoint(text)', 'execute'), 'the helper is internal');

-- ===== 2. save_push_subscription rejects hosts outside the allowlist =====
set local role authenticated;
select pg_temp.as_user(pg_temp.u(13));
select throws_ok($$select public.save_push_subscription('https://169.254.169.254/latest/meta-data/', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: IP literal rejected');
select throws_ok($$select public.save_push_subscription('https://localhost/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: localhost rejected');
select throws_ok($$select public.save_push_subscription('https://user@fcm.googleapis.com/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: userinfo rejected');
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com:8443/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: non-443 port rejected');
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com.evil.com/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: look-alike host rejected');
select throws_ok($$select public.save_push_subscription('https://push.example.com/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'RPC: arbitrary https host rejected');
select lives_ok($$select public.save_push_subscription('https://updates.push.services.mozilla.com/wpush/v2/abc', 'BKey', 'auth', 'Firefox')$$,
  'RPC: Mozilla accepted');
select lives_ok($$select public.save_push_subscription('https://db5p.notify.windows.com/w/?token=abc', 'BKey', 'auth', 'Edge')$$,
  'RPC: Windows accepted');
select lives_ok($$select public.save_push_subscription('https://web.push.apple.com/QAbc', 'BKey', 'auth', 'Safari')$$,
  'RPC: Apple accepted');
select is((select count(*)::integer from public.push_subscriptions), 3, 'only the accepted subscriptions were stored');
reset role;

-- ===== 3. CHECK constraint on the table =====
select is((select convalidated from pg_constraint where conname = 'push_subscriptions_endpoint_allowed'), true,
  'the endpoint CHECK exists and is validated');
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('20000000-0000-4000-8000-000000000013', 'https://169.254.169.254/latest/meta-data/', 'BKey', 'auth')$$,
  '23514', null, 'CHECK: a foreign host cannot be inserted even by a privileged writer');
select throws_ok($$update public.push_subscriptions set endpoint = 'https://evil.example/x' where user_id = '20000000-0000-4000-8000-000000000013'$$,
  '23514', null, 'CHECK: an endpoint cannot be rewritten to a foreign host');
select lives_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('20000000-0000-4000-8000-000000000013', 'https://fcm.googleapis.com/fcm/send/direct', 'BKey', 'auth')$$,
  'CHECK: an allowed host can be inserted');
delete from public.push_subscriptions where user_id = pg_temp.u(13);

-- ===== 4. Rate limit: 20 saves per hour =====
set local role authenticated;
select pg_temp.as_user(pg_temp.u(16));
select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r' || i, 'BKey' || i, 'auth' || i, null)
from generate_series(1, 20) as i;
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r21', 'BKey', 'auth', null)$$,
  'P0001', 'rate_limited', 'the 21st save within an hour is rate limited');
select throws_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r1', 'BKey', 'auth', null)$$,
  'P0001', 'rate_limited', 're-saving an existing endpoint counts too');
select is((select count(*)::integer from public.push_subscriptions), 5, 'still at most 5 subscriptions');
select pg_temp.as_user(pg_temp.u(14));
select lives_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/other', 'BKey', 'auth', null)$$,
  'another learner is not affected');
select throws_ok($$select public.save_push_subscription('https://localhost/x', 'BKey', 'auth', null)$$,
  'P0001', 'invalid_subscription', 'invalid input is rejected as invalid, not rate limited');
select throws_ok($$select count(*) from public.push_subscription_saves$$, '42501', null, 'learners cannot read the bookkeeping');
reset role;
select is((select count(*)::integer from public.push_subscription_saves where user_id = pg_temp.u(16)), 20, '20 calls recorded');
update public.push_subscription_saves set saved_at = now() - interval '2 hours' where user_id = pg_temp.u(16);
set local role authenticated;
select pg_temp.as_user(pg_temp.u(16));
select lives_ok($$select public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r22', 'BKey', 'auth', null)$$,
  'calls older than an hour no longer count');
reset role;
select ok(not has_table_privilege('authenticated', 'public.push_subscription_saves', 'select'), 'learners cannot read the rate-limit table');
delete from public.push_subscriptions where user_id in (pg_temp.u(16), pg_temp.u(14));

-- ===== 5. Subscription keys are hidden from learners =====
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (pg_temp.u(13), 'https://fcm.googleapis.com/fcm/send/keys', 'BSecretP256', 'SecretAuth');
select ok(not has_column_privilege('authenticated', 'public.push_subscriptions', 'p256dh', 'select'), 'authenticated cannot select p256dh');
select ok(not has_column_privilege('authenticated', 'public.push_subscriptions', 'auth', 'select'), 'authenticated cannot select auth');
select ok(has_column_privilege('authenticated', 'public.push_subscriptions', 'endpoint', 'select'), 'authenticated can still select endpoint');
select ok(has_column_privilege('service_role', 'public.push_subscriptions', 'p256dh', 'select'), 'service_role reads the keys');
set local role authenticated;
select pg_temp.as_user(pg_temp.u(13));
select throws_ok($$select p256dh from public.push_subscriptions$$, '42501', null, 'select p256dh denied');
select throws_ok($$select auth from public.push_subscriptions$$, '42501', null, 'select auth denied');
select throws_ok($$select * from public.push_subscriptions$$, '42501', null, 'select * denied');
select is((select array_agg(endpoint) from public.push_subscriptions), array['https://fcm.googleapis.com/fcm/send/keys'],
  'the other columns are readable, own rows only');
select pg_temp.as_user(pg_temp.u(14));
select is((select count(*)::integer from public.push_subscriptions), 0, 'RLS still hides other learners'' subscriptions');
reset role;
delete from public.push_subscriptions where user_id = pg_temp.u(13);

-- ===== Fixtures for the catch-up window =====
insert into public.notification_prefs (user_id, reminders_enabled, remind_at, remind_days, quiet_start, quiet_end, max_per_day, push_enabled)
values
  (pg_temp.u(1), true,  '10:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- late run inside the window
  (pg_temp.u(2), true,  '11:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- last minute of the window
  (pg_temp.u(3), true,  '13:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- run only after the window
  (pg_temp.u(4), true,  '21:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- late run lands in quiet hours
  (pg_temp.u(5), true,  '12:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 2, true),  -- two slots a day
  (pg_temp.u(6), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- weekly summary only
  (pg_temp.u(7), true,  '08:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- lesson in progress
  (pg_temp.u(8), true,  '09:00', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- cards due
  (pg_temp.u(9), true,  '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true),  -- push on, no device
  (pg_temp.u(10), true, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, false), -- device, push off
  (pg_temp.u(11), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true), -- weekly inside quiet hours
  (pg_temp.u(12), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true), -- weekly outside quiet hours
  (pg_temp.u(15), false, '19:30', '{1,2,3,4,5,6,7}', '22:00', '07:00', 1, true); -- no reminders, no path
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
select pg_temp.u(i), 'https://fcm.googleapis.com/fcm/send/dev' || i, 'BKey' || i, 'auth' || i
from unnest(array[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 15]) as i;

select set_config('test.p6', pg_temp.path(6, 30)::text, true);
select set_config('test.p7', pg_temp.path(7, 30)::text, true);
select set_config('test.p8', pg_temp.path(8, 30)::text, true);
select set_config('test.p5', pg_temp.path(5, 30)::text, true);
select set_config('request.jwt.claims', '', true);
select set_config('test.lesson', '69dc577d-a377-5093-af0f-9c23deb82650', true);
select set_config('test.title', (select title ->> 'vi' from public.lessons where id = '69dc577d-a377-5093-af0f-9c23deb82650'), true);
select ok(nullif(current_setting('test.title'), '') is not null, 'precondition: the fixture lesson has a Vietnamese title');
insert into public.lesson_runs (user_id, learning_path_id, lesson_id, content_version, queue, started_at)
values (pg_temp.u(7), current_setting('test.p7')::uuid, current_setting('test.lesson')::uuid, 1, '{}', '2026-10-13 10:00Z');
insert into public.review_cards (user_id, learning_path_id, learning_item_id, direction, fsrs_state, stability, difficulty, reps, due_at)
select x.uid, x.path, i.id, 'recognize', 'review', 3, 5, 2, '2026-10-10 00:00Z'
from (values (pg_temp.u(8), current_setting('test.p8')::uuid, 2), (pg_temp.u(5), current_setting('test.p5')::uuid, 1)) as x (uid, path, n)
cross join lateral (
  select li.id from public.learning_items li where li.language_code = 'en' and li.status = 'published' order by li.id limit x.n
) as i;

-- ===== 6. Generic push text, detailed inbox rows =====
select set_config('test.g7', pg_temp.gen('2026-10-14 01:10Z')::text, true); -- 08:10 VN, 10 minutes late
select is(pg_temp.n(7, 'resume_lesson'), 1, 'resume_lesson created by a run 10 minutes after the slot');
select is((select body_vi from public.notifications where user_id = pg_temp.u(7)),
  format('Bài “%s” vẫn đang chờ bạn. Mở lại là học tiếp từ chỗ đã dừng.', btrim(current_setting('test.title'))),
  'the inbox row keeps the lesson title');
select is(pg_temp.out(current_setting('test.g7')::jsonb, 7) -> 0 ->> 'body', 'Bài học của bạn vẫn đang chờ. Mở lại là học tiếp từ chỗ đã dừng.',
  'push body of resume_lesson is generic');
select is(position(current_setting('test.title') in (pg_temp.out(current_setting('test.g7')::jsonb, 7) -> 0)::text), 0,
  'the lesson title is nowhere in the push row');
select is(pg_temp.out(current_setting('test.g7')::jsonb, 7) -> 0 ->> 'url', '/app/hoc-tap/bai/' || current_setting('test.lesson'),
  'the push still opens the lesson');

select set_config('test.g8', pg_temp.gen('2026-10-14 02:05Z')::text, true); -- 09:05 VN
select is((select body_vi from public.notifications where user_id = pg_temp.u(8)), 'Có 2 thẻ đang chờ — ôn 5 phút là đủ.',
  'the inbox row keeps the due-card count');
select is(pg_temp.out(current_setting('test.g8')::jsonb, 8) -> 0 ->> 'body', 'Có vài thẻ đang chờ bạn ôn nhanh.', 'push body of review_due is generic');
select is(pg_temp.out(current_setting('test.g8')::jsonb, 8) -> 0 ->> 'title', 'Ôn tập nhanh 5 phút', 'push title of review_due');
select ok((pg_temp.out(current_setting('test.g8')::jsonb, 8) -> 0 ->> 'body') !~ '[0-9]', 'no number in the review_due push body');

-- ===== 7. Catch-up: a late run delivers once =====
select set_config('test.g1', pg_temp.gen('2026-10-14 03:20Z')::text, true); -- 10:20 VN, slot 10:00
select is(pg_temp.n(1, 'quick_check'), 1, 'a run 20 minutes after the slot still creates the reminder');
select is(jsonb_array_length(pg_temp.out(current_setting('test.g1')::jsonb, 1)), 1, 'and returns it for the push');
select is((select created_at from public.notifications where user_id = pg_temp.u(1)), '2026-10-14 03:20Z'::timestamptz, 'created at the run time');
select is(pg_temp.out(pg_temp.gen('2026-10-14 03:20Z'), 1), '[]'::jsonb, 'the same run again returns nothing');
select pg_temp.gen('2026-10-14 03:35Z');
select pg_temp.gen('2026-10-14 03:59Z');
select is(pg_temp.n(1), 1, 'later runs inside the window do not duplicate');
select pg_temp.gen('2026-10-14 04:05Z');
select is(pg_temp.n(1), 1, 'nor after the window');

select pg_temp.gen('2026-10-14 04:59Z'); -- 11:59 VN, slot 11:00
select is(pg_temp.n(2, 'quick_check'), 1, 'the last minute of the 60-minute window still delivers');
select pg_temp.gen('2026-10-14 05:00Z'); -- 12:00 VN: u5 slot 0, u2's window is closed
select is(pg_temp.n(2), 1, 'u2 gets nothing more');
select is(pg_temp.n(5), 1, 'u5: the first slot sends one reminder');
select pg_temp.gen('2026-10-14 05:40Z');
select is(pg_temp.n(5), 1, 'u5: a late run in the same slot does not send the second reminder of max_per_day 2');
select pg_temp.gen('2026-10-14 07:00Z'); -- 14:00 VN, u3's window (13:00-14:00) just closed
select is(pg_temp.n(3), 0, 'a first run after the 60-minute window does not deliver');
select pg_temp.gen('2026-10-14 08:20Z'); -- 15:20 VN, second slot of u5 (15:00)
select is(pg_temp.n(5), 2, 'u5: the second slot (+3 h) delivers when caught up 20 minutes late');
select pg_temp.gen('2026-10-14 08:50Z');
select is(pg_temp.n(5), 2, 'u5: no duplicate in the second slot either');
select pg_temp.gen('2026-10-14 11:00Z'); -- 18:00 VN: no third slot
select is(pg_temp.n(5), 2, 'u5: no third reminder');

-- ===== 8. Catch-up respects quiet hours =====
select pg_temp.gen('2026-10-14 14:50Z'); -- 21:50 VN: u4's slot (21:30), not quiet yet
select is(pg_temp.n(4), 1, 'u4: caught up at 21:50, before quiet hours');
delete from public.notifications where user_id = pg_temp.u(4);
select pg_temp.gen('2026-10-14 15:10Z'); -- 22:10 VN, inside the 21:30-22:30 window but in quiet hours
select is(pg_temp.n(4), 0, 'u4: a catch-up inside quiet hours is blocked');
select pg_temp.gen('2026-10-14 15:20Z');
select is(pg_temp.n(4), 0, 'u4: and stays blocked until the window closes');

-- ===== 9. Weekly summary catches up =====
select set_config('test.gw', pg_temp.gen('2026-10-18 12:50Z')::text, true); -- Sunday 19:50 VN, slot 19:30
select is(pg_temp.n(6, 'weekly_summary'), 1, 'weekly summary created by a late run');
select is(pg_temp.n(6, 'quick_check') + pg_temp.n(6, 'review_due') + pg_temp.n(6, 'resume_lesson'), 0, 'reminders off: only the summary');
select pg_temp.gen('2026-10-18 12:50Z');
select pg_temp.gen('2026-10-18 13:10Z');
select is(pg_temp.n(6, 'weekly_summary'), 1, 'the weekly summary is not duplicated by later runs');
select is(pg_temp.out(current_setting('test.gw')::jsonb, 6) -> 0 ->> 'body', 'Báo cáo tuần của bạn đã sẵn sàng.', 'weekly push body is generic');
select ok((pg_temp.out(current_setting('test.gw')::jsonb, 6) -> 0 ->> 'body') !~ '[0-9]', 'no number in the weekly push body');
select ok((select body_vi from public.notifications where user_id = pg_temp.u(6) and kind = 'weekly_summary') like 'Tuần này bạn%',
  'the weekly inbox row keeps the detail');
select pg_temp.gen('2026-10-18 13:31Z'); -- 20:31 VN, window closed
select is((select count(*)::integer from public.notifications where kind = 'weekly_summary' and user_id = pg_temp.u(6)), 1, 'still one summary');

-- ===== 10. Retryable pickup =====
select is(pg_temp.out(pg_temp.gen('2026-10-14 03:20Z'), 1), '[]'::jsonb, 'precondition: generate no longer returns u1''s reminder');
select is(jsonb_array_length(pg_temp.pend('2026-10-14 03:30Z', 1)), 1, 'an undelivered reminder is picked up although generate returned it earlier');
select is(pg_temp.pend('2026-10-14 03:30Z', 1) -> 0 ->> 'body', 'Vài câu luyện nhanh giúp kiến thức ở lại lâu hơn. Lúc nào tiện thì mình bắt đầu.',
  'picked up with the generic text');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.pend('2026-10-14 03:30Z', 1) -> 0) as k),
  array['body', 'notification_id', 'title', 'url', 'user_id'], 'dueNotificationSchema keys');
select is(jsonb_array_length(pg_temp.pend('2026-10-14 07:19Z', 1)), 1, 'still picked up 3 h 59 min after creation');
select is(pg_temp.pend('2026-10-14 07:21Z', 1), '[]'::jsonb, 'dropped after the 4-hour push TTL');
select is(pg_temp.pend('2026-10-14 03:10Z', 1), '[]'::jsonb, 'a row created after p_now is not picked up');
select is(jsonb_array_length(pg_temp.pend('2026-10-14 08:30Z', 5)), 2, 'u5: both reminders (05:00Z and 08:20Z) are within 4 h at 08:30Z');
update public.notifications set delivered_push_at = '2026-10-14 03:21Z' where user_id = pg_temp.u(1);
select is(pg_temp.pend('2026-10-14 03:30Z', 1), '[]'::jsonb, 'delivered rows are not picked up again');
select is(jsonb_array_length(pg_temp.pend('2026-10-14 08:30Z', 5)), 2, 'u5 is unaffected by u1''s delivery');

select is(jsonb_array_length(pg_temp.pend('2026-10-14 03:30Z', 2)), 0, 'u2 row (created 04:59Z) is in the future at 03:30Z');
select is(jsonb_array_length(pg_temp.pend('2026-10-14 05:30Z', 2)), 1, 'u2 row picked up at 05:30Z');
update public.notifications set read_at = '2026-10-14 05:00Z' where user_id = pg_temp.u(2);
select is(pg_temp.pend('2026-10-14 05:30Z', 2), '[]'::jsonb, 'a row the learner already read is not pushed');

select is(jsonb_array_length(pg_temp.pend('2026-10-14 01:30Z', 7)), 1, 'u7: resume_lesson picked up');
insert into public.activity_days (user_id, learning_path_id, local_day, lessons, active_ms)
values (pg_temp.u(7), current_setting('test.p7')::uuid, '2026-10-14', 1, 600000);
select is(pg_temp.pend('2026-10-14 01:30Z', 7), '[]'::jsonb, 'u7: not pushed once the learner studied that day');

-- Push off, no device, quiet-hours weekly.
insert into public.notifications (user_id, kind, title_vi, body_vi, action_url, local_day, created_at) values
  (pg_temp.u(9),  'quick_check', 't', 'b', '/app/phien-hoc?phut=10', '2026-10-14', '2026-10-14 12:30Z'),
  (pg_temp.u(10), 'quick_check', 't', 'b', '/app/phien-hoc?phut=10', '2026-10-14', '2026-10-14 12:30Z'),
  (pg_temp.u(11), 'weekly_summary', 't', 'b', '/app/tien-do', '2026-10-18', '2026-10-18 15:30Z'),
  (pg_temp.u(12), 'weekly_summary', 't', 'b', '/app/tien-do', '2026-10-18', '2026-10-18 12:30Z'),
  (pg_temp.u(15), 'quick_check', 't', 'b', '/app/phien-hoc?phut=10', '2026-10-18', '2026-10-18 12:30Z');
select is(pg_temp.pend('2026-10-14 12:40Z', 9), '[]'::jsonb, 'no device: not picked up');
select is(pg_temp.pend('2026-10-14 12:40Z', 10), '[]'::jsonb, 'push disabled: not picked up');
select is(pg_temp.pend('2026-10-18 15:40Z', 11), '[]'::jsonb, 'a weekly summary created in quiet hours (22:30) waits');
select is(jsonb_array_length(pg_temp.pend('2026-10-18 12:40Z', 12)), 1, 'a weekly summary outside quiet hours is picked up');
select is(pg_temp.pend('2026-10-18 12:40Z', 12) -> 0 ->> 'title', 'Báo cáo tuần của bạn', 'weekly push title');
select is(jsonb_array_length(public.pending_push_notifications('2026-10-18 12:40Z', 1)), 1, 'p_limit caps the result');
select is(jsonb_array_length(public.pending_push_notifications('2026-10-18 12:40Z', 0)), 1, 'p_limit is clamped to at least 1');
select is(public.pending_push_notifications('2020-01-01Z', 10), '[]'::jsonb, 'nothing is pending in the distant past');

select ok(not has_function_privilege('authenticated', 'public.pending_push_notifications(timestamptz, integer)', 'execute'), 'learners cannot call the pickup');
select ok(not has_function_privilege('anon', 'public.pending_push_notifications(timestamptz, integer)', 'execute'), 'anon cannot call the pickup');
select ok(has_function_privilege('service_role', 'public.pending_push_notifications(timestamptz, integer)', 'execute'), 'service_role can call the pickup');
set local role authenticated;
select pg_temp.as_user(pg_temp.u(1));
select throws_ok($$select public.pending_push_notifications(now(), 10)$$, '42501', null, 'learner: pickup denied');
reset role;
set local role service_role;
select lives_ok($$select public.pending_push_notifications(now(), 10)$$, 'service_role runs the pickup');
reset role;

-- ===== 11. Retention of the rate-limit bookkeeping =====
insert into public.push_subscription_saves (user_id, saved_at) values (pg_temp.u(14), now() - interval '2 days'), (pg_temp.u(14), now());
set local role service_role;
select lives_ok($$select public.purge_notifications()$$, 'purge still runs');
reset role;
select is((select count(*)::integer from public.push_subscription_saves where user_id = pg_temp.u(14) and saved_at < now() - interval '1 day'), 0,
  'rate-limit rows older than a day are purged');
select ok(exists (select 1 from public.push_subscription_saves where user_id = pg_temp.u(14)), 'recent rate-limit rows are kept');

-- ===== 12. Copy stays free of guilt =====
select is((select count(*)::integer from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace,
    unnest(array['lười', 'bỏ lỡ', 'phá chuỗi', 'mất chuỗi', 'thất vọng', 'đáng xấu hổ', 'đừng bỏ cuộc']) as w
  where ns.nspname = 'public' and p.proname in ('reminders_push_text', 'pending_push_notifications', 'generate_due_notifications')
    and lower(p.prosrc) like '%' || w || '%'), 0, 'no forbidden phrase in the push text functions');

select * from finish();
rollback;
