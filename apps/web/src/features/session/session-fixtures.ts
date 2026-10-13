import type { SessionActivity, SessionInputs, SessionPlan, StudySession, TodaySessionResult } from '@linguo/shared';

// Shared by the session feature and SessionPage tests.

export const SESSION_PATH_ID = '30000000-0000-4000-8000-000000000001';
export const SESSION_ID = '60000000-0000-4000-8000-000000000001';
export const LESSON_A = '50000000-0000-4000-8000-00000000000a';
export const LESSON_B = '50000000-0000-4000-8000-00000000000b';

export function activity(overrides: Partial<SessionActivity> & Pick<SessionActivity, 'id'>): SessionActivity {
  return {
    kind: 'lesson',
    minutes: 5,
    lesson_id: LESSON_A,
    review_limit: null,
    title_vi: 'Bài mới',
    reason_vi: 'Bài tiếp theo trong lộ trình A1',
    priority: 60,
    status: 'pending',
    seconds_spent: 0,
    ...overrides,
  };
}

export function plan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  return {
    minutes: 30,
    focus_vi: 'Ưu tiên ôn tập: 18 thẻ đến hạn',
    backlog_mode: false,
    activities: [
      activity({
        id: 'a1',
        kind: 'review',
        minutes: 6,
        lesson_id: null,
        review_limit: 25,
        title_vi: 'Ôn thẻ đến hạn',
        reason_vi: '18 thẻ đến hạn, 6 thẻ quá hạn',
        priority: 90,
      }),
      activity({ id: 'a2', kind: 'lesson', minutes: 9, lesson_id: LESSON_A, title_vi: 'Chào hỏi', reason_vi: 'Bài tiếp theo trong lộ trình A1' }),
      activity({
        id: 'a3',
        kind: 'practice',
        minutes: 9,
        lesson_id: LESSON_B,
        title_vi: 'Luyện ngữ pháp',
        reason_vi: 'Ngữ pháp đang đúng 58% trong 2 tuần qua',
        priority: 58,
      }),
      activity({ id: 'a4', kind: 'recap', minutes: 3, lesson_id: null, title_vi: 'Tổng kết', reason_vi: 'Xem lại lỗi sai hôm nay', priority: 10 }),
    ],
    ...overrides,
  };
}

export function studySession(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: SESSION_ID,
    path_id: SESSION_PATH_ID,
    local_date: '2026-10-13',
    status: 'planned',
    minutes_planned: 30,
    plan: plan(),
    created_at: '2026-10-13T01:00:00Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

/** A session whose activities have the given statuses, in order. */
export function sessionWithStatuses(statuses: SessionActivity['status'][], overrides: Partial<StudySession> = {}): StudySession {
  const base = plan();
  return studySession({
    status: statuses.some((s) => s !== 'pending') ? 'in_progress' : 'planned',
    plan: {
      ...base,
      activities: base.activities.map((a, i) => {
        const status = statuses[i] ?? a.status;
        return { ...a, status, seconds_spent: status === 'done' ? a.minutes * 60 : 0 };
      }),
    },
    ...overrides,
  });
}

export function todayResult(session: StudySession | null = studySession(), overrides: Partial<TodaySessionResult> = {}): TodaySessionResult {
  return { session, studied_seconds_today: 0, daily_goal_minutes: 30, ...overrides };
}

export function inputs(overrides: Partial<SessionInputs> = {}): SessionInputs {
  return {
    path_id: SESSION_PATH_ID,
    language_code: 'en',
    local_date: '2026-10-13',
    daily_goal_minutes: 30,
    studied_seconds_today: 0,
    due_count: 18,
    overdue_count: 6,
    new_card_count: 4,
    next_lessons: [],
    skills: [],
    days_since_last_study: 1,
    ...overrides,
  };
}
