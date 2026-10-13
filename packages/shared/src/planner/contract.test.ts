import { describe, expect, it } from 'vitest';
import {
  SESSION_ERROR_CODES,
  sessionInputsSchema,
  sessionPlanSchema,
  studySessionSchema,
  todaySessionResultSchema,
} from './contract';

// Payloads captured from supabase/migrations/20261014000900_session_planner.sql (key order as Postgres jsonb
// prints it), so a change on either side shows up here.

const inputs = {
  skills: [
    { skill: 'vocabulary', confidence: 'self_reported', level_code: 'pre_a1', recent_accuracy: 0.4 },
    { skill: 'grammar', confidence: 'self_reported', level_code: 'pre_a1', recent_accuracy: null },
  ],
  path_id: '7c65da85-659f-462d-a775-5fc94cf6e7d2',
  due_count: 2,
  local_date: '2026-10-14',
  next_lessons: [
    {
      skills: ['vocabulary'],
      title_vi: 'Chào hỏi',
      lesson_id: 'c6000000-0000-4000-8000-000000000011',
      run_status: 'in_progress',
      unit_order: 1,
      lesson_order: 1,
      estimated_minutes: 7,
    },
  ],
  language_code: 'en',
  overdue_count: 1,
  new_card_count: 1,
  daily_goal_minutes: 15,
  days_since_last_study: null,
  studied_seconds_today: 0,
};

const session = {
  id: 'd8b98382-7b5d-4460-b924-b0009084378b',
  plan: {
    minutes: 30,
    focus_vi: 'Ưu tiên ôn tập',
    activities: [
      {
        id: 'a1',
        kind: 'review',
        status: 'done',
        minutes: 6,
        priority: 75,
        title_vi: 'Ôn tập',
        lesson_id: null,
        reason_vi: '18 thẻ đến hạn, 6 thẻ quá hạn',
        review_limit: 20,
        seconds_spent: 120,
      },
      {
        id: 'a2',
        kind: 'lesson',
        status: 'pending',
        minutes: 10,
        priority: 60,
        title_vi: 'Chào hỏi',
        lesson_id: 'c6000000-0000-4000-8000-000000000011',
        reason_vi: 'Bài tiếp theo trong lộ trình A1',
        review_limit: null,
        seconds_spent: 0,
      },
    ],
    backlog_mode: false,
  },
  status: 'in_progress',
  path_id: '7c65da85-659f-462d-a775-5fc94cf6e7d2',
  created_at: '2026-10-13T16:28:20.496217+00:00',
  local_date: '2026-10-14',
  started_at: '2026-10-13T16:28:20.54171+00:00',
  completed_at: null,
  minutes_planned: 30,
};

describe('planner contract vs SQL payloads', () => {
  it('parses get_session_inputs', () => {
    expect(sessionInputsSchema.parse(inputs)).toEqual(inputs);
  });

  it('parses a session from save_session_plan / update_session_item / reorder_session / finish_session', () => {
    expect(studySessionSchema.parse(session)).toEqual(session);
    expect(sessionPlanSchema.parse(session.plan)).toEqual(session.plan);
  });

  it('parses get_today_session with and without a session', () => {
    const withSession = { session, daily_goal_minutes: 15, studied_seconds_today: 120 };
    expect(todaySessionResultSchema.parse(withSession)).toEqual(withSession);
    const empty = { session: null, daily_goal_minutes: 15, studied_seconds_today: 0 };
    expect(todaySessionResultSchema.parse(empty)).toEqual(empty);
  });

  it('lists every error code raised by the RPCs', () => {
    expect([...SESSION_ERROR_CODES].sort()).toEqual(
      [
        'invalid_order',
        'invalid_plan',
        'item_not_found',
        'not_authenticated',
        'path_not_active',
        'path_not_found',
        'session_closed',
        'session_not_found',
      ].sort(),
    );
  });
});
