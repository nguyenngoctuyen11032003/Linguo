import { progressDashboardSchema, type ActivityDay, type Motivation, type ProgressDashboard } from '@linguo/shared';

// Local test data for the presentational Tiến độ components, validated against the shared contract
// so it cannot drift from what get_progress_dashboard returns.

export const FIXTURE_PATH_ID = '22222222-2222-4222-8222-222222222222';
export const FIXTURE_LESSON_ID = '33333333-3333-4333-8333-333333333333';
export const FIXTURE_TODAY = '2026-10-13';

const day = (date: string, minutes: number, goal_minutes: number, extra: Partial<ActivityDay> = {}): ActivityDay => ({
  date,
  minutes,
  xp: minutes * 2,
  lessons: minutes >= 10 ? 1 : 0,
  reviews: minutes,
  answers: minutes * 2,
  goal_minutes,
  active: minutes >= 5,
  ...extra,
});

/** Wed 07/10 → Tue 13/10; Saturday and Sunday are rest days (goal 0). */
export const FIXTURE_DAYS: ActivityDay[] = [
  day('2026-10-07', 25, 20),
  day('2026-10-08', 12, 20),
  day('2026-10-09', 0, 20),
  day('2026-10-10', 0, 0),
  day('2026-10-11', 8, 0),
  day('2026-10-12', 30, 20),
  day('2026-10-13', 15, 20),
];

export function motivationFixture(overrides: Partial<Motivation> = {}): Motivation {
  return {
    xp_total: 1240,
    xp_week: 180,
    streak_current: 6,
    streak_best: 11,
    grace_left: 1,
    weekly_challenge: { target_days: 5, done_days: 2, completed: false, completed_weeks: 3 },
    badges: [
      { key: 'first_lesson', earned_at: '2026-09-20T08:00:00Z' },
      { key: 'streak_7', earned_at: '2026-10-05T12:30:00Z' },
    ],
    new_badges: [],
    ...overrides,
  };
}

export function dashboardFixture(overrides: Partial<ProgressDashboard> = {}): ProgressDashboard {
  return progressDashboardSchema.parse({
    path_id: FIXTURE_PATH_ID,
    range_days: 7,
    today: FIXTURE_TODAY,
    days: FIXTURE_DAYS,
    totals: {
      today_minutes: 15,
      week_minutes: 45,
      week_goal_minutes: 100,
      range_minutes: 90,
      lessons_completed: 4,
      reviews_done: 62,
      application_done: 7,
    },
    skills: [
      { skill: 'vocabulary', attempts: 40, accuracy: 0.82, prev_attempts: 35, prev_accuracy: 0.76 },
      { skill: 'grammar', attempts: 22, accuracy: 0.64, prev_attempts: 20, prev_accuracy: 0.7 },
      { skill: 'reading', attempts: 12, accuracy: 0.75, prev_attempts: 12, prev_accuracy: 0.75 },
      { skill: 'listening', attempts: 4, accuracy: null, prev_attempts: 0, prev_accuracy: null },
      { skill: 'writing', attempts: 15, accuracy: 0.6, prev_attempts: 3, prev_accuracy: null },
      { skill: 'speaking', attempts: 0, accuracy: null, prev_attempts: 0, prev_accuracy: null },
    ],
    exercise_types: [
      { exercise_type: 'mcq', attempts: 30, accuracy: 0.9, prev_attempts: 25, prev_accuracy: 0.85 },
      { exercise_type: 'fill_blank', attempts: 14, accuracy: 0.71, prev_attempts: 10, prev_accuracy: 0.71 },
      { exercise_type: 'word_bank', attempts: 9, accuracy: null, prev_attempts: 4, prev_accuracy: null },
      { exercise_type: 'translate', attempts: 11, accuracy: 0.55, prev_attempts: 10, prev_accuracy: 0.6 },
      { exercise_type: 'listen', attempts: 0, accuracy: null, prev_attempts: 0, prev_accuracy: null },
    ],
    estimates: [
      {
        skill: 'vocabulary',
        level_code: 'a2',
        confidence: 'medium',
        source: 'diagnostic',
        sample_size: 18,
        assessed_at: '2026-10-01T09:15:00Z',
      },
      {
        skill: 'grammar',
        level_code: 'a1',
        confidence: 'self_reported',
        source: 'self_report',
        sample_size: 0,
        assessed_at: '2026-09-15T07:00:00Z',
      },
    ],
    mistakes: [
      {
        prompt: 'She ___ to school every day.',
        lesson_id: FIXTURE_LESSON_ID,
        lesson_title: 'Thì hiện tại đơn',
        wrong_count: 3,
        last_wrong_at: '2026-10-12T10:00:00Z',
      },
    ],
    motivation: motivationFixture(),
    ...overrides,
  });
}
