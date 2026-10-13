import type { SessionActivity, StudySession } from '@linguo/shared';

// Test fixtures for spec 6 sessions (unit tests only).

export const FIXTURE_SESSION_ID = '5e551011-0000-4000-8000-000000000001';
export const FIXTURE_PATH_ID = '5e551011-0000-4000-8000-0000000000aa';

export function activity(overrides: Partial<SessionActivity> = {}): SessionActivity {
  return {
    id: 'a1',
    kind: 'review',
    minutes: 5,
    lesson_id: null,
    review_limit: 20,
    title_vi: 'Ôn thẻ đến hạn',
    reason_vi: 'Có 20 thẻ đến hạn hôm nay.',
    priority: 90,
    status: 'pending',
    seconds_spent: 0,
    ...overrides,
  };
}

export function studySession(overrides: Partial<StudySession> = {}, activities?: SessionActivity[]): StudySession {
  return {
    id: FIXTURE_SESSION_ID,
    path_id: FIXTURE_PATH_ID,
    local_date: '2026-10-13',
    status: 'in_progress',
    minutes_planned: 30,
    plan: {
      minutes: 30,
      activities: activities ?? [
        activity({ status: 'done', seconds_spent: 300 }),
        activity({ id: 'a2', kind: 'lesson', lesson_id: '5e551011-0000-4000-8000-0000000000b1', review_limit: null, title_vi: 'Bài mới' }),
        activity({
          id: 'a3',
          kind: 'practice',
          lesson_id: '5e551011-0000-4000-8000-0000000000b2',
          review_limit: null,
          title_vi: 'Nghe',
          reason_vi: 'Độ chính xác phần nghe 14 ngày qua thấp nhất.',
          priority: 60,
        }),
      ],
      focus_vi: 'Ưu tiên ôn tập: 20 thẻ đến hạn',
      backlog_mode: false,
    },
    created_at: '2026-10-13T01:00:00Z',
    started_at: '2026-10-13T01:05:00Z',
    completed_at: null,
    ...overrides,
  };
}
