import { SKILLS, type ActivityDay, type ProgressDashboard, type ProgressRange } from '@linguo/shared';

// Valid (zod-parseable) get_progress_dashboard payloads shared by the progress unit tests.

export const PROGRESS_PATH_ID = '30000000-0000-4000-8000-000000000001';
export const PROGRESS_LESSON_ID = '40000000-0000-4000-8000-000000000001';
export const PROGRESS_TODAY = '2026-10-13';

const EXERCISE_TYPES = ['mcq', 'fill_blank', 'word_bank', 'translate', 'listen'] as const;

function isoDay(today: string, offset: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** `range` days oldest → newest ending at `today`; Sundays are rest days (goal 0). */
export function activityDays(range: ProgressRange = 7, today = PROGRESS_TODAY, filled = true): ActivityDay[] {
  return Array.from({ length: range }, (_, i) => {
    const date = isoDay(today, range - 1 - i);
    const rest = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    const minutes = filled && !rest ? 10 + ((i * 7) % 20) : 0;
    return {
      date,
      minutes,
      xp: minutes * 2,
      lessons: filled && !rest && i % 2 === 0 ? 1 : 0,
      reviews: filled && !rest ? 12 : 0,
      answers: filled && !rest ? 20 : 0,
      goal_minutes: rest ? 0 : 15,
      active: minutes >= 5,
    };
  });
}

export function dashboardFixture(overrides: Partial<ProgressDashboard> = {}): ProgressDashboard {
  const range = overrides.range_days ?? 7;
  return {
    path_id: PROGRESS_PATH_ID,
    range_days: range,
    today: PROGRESS_TODAY,
    days: activityDays(range),
    totals: {
      today_minutes: 18,
      week_minutes: 95,
      week_goal_minutes: 90,
      range_minutes: 95,
      lessons_completed: 4,
      reviews_done: 72,
      application_done: 3,
    },
    skills: SKILLS.map((skill, i) => ({
      skill,
      attempts: i < 4 ? 20 + i * 5 : 4,
      accuracy: i < 4 ? 0.6 + i * 0.08 : null,
      prev_attempts: i < 3 ? 15 : 0,
      prev_accuracy: i < 3 ? 0.65 : null,
    })),
    exercise_types: EXERCISE_TYPES.map((exercise_type, i) => ({
      exercise_type,
      attempts: i < 3 ? 25 : 3,
      accuracy: i < 3 ? 0.7 + i * 0.05 : null,
      prev_attempts: i < 2 ? 20 : 0,
      prev_accuracy: i < 2 ? 0.75 : null,
    })),
    estimates: [
      {
        skill: 'vocabulary',
        level_code: 'A2',
        confidence: 'medium',
        source: 'diagnostic',
        sample_size: 24,
        assessed_at: '2026-10-01T08:00:00Z',
      },
      {
        skill: 'grammar',
        level_code: 'A1',
        confidence: 'self_reported',
        source: 'self_report',
        sample_size: 0,
        assessed_at: '2026-09-20T08:00:00Z',
      },
    ],
    mistakes: [
      {
        prompt: 'She ___ to school every day.',
        lesson_id: PROGRESS_LESSON_ID,
        lesson_title: 'Thì hiện tại đơn',
        wrong_count: 3,
        last_wrong_at: '2026-10-12T09:30:00Z',
      },
    ],
    motivation: {
      xp_total: 1240,
      xp_week: 190,
      streak_current: 5,
      streak_best: 12,
      grace_left: 1,
      weekly_challenge: { target_days: 6, done_days: 2, completed: false, completed_weeks: 1 },
      badges: [
        { key: 'first_lesson', earned_at: '2026-09-21T10:00:00Z' },
        { key: 'streak_7', earned_at: '2026-10-05T10:00:00Z' },
      ],
      new_badges: [],
    },
    ...overrides,
  };
}

/** A learner who has a path but has not studied yet. */
export function emptyDashboardFixture(overrides: Partial<ProgressDashboard> = {}): ProgressDashboard {
  const range = overrides.range_days ?? 7;
  return dashboardFixture({
    days: activityDays(range, PROGRESS_TODAY, false),
    totals: {
      today_minutes: 0,
      week_minutes: 0,
      week_goal_minutes: 90,
      range_minutes: 0,
      lessons_completed: 0,
      reviews_done: 0,
      application_done: 0,
    },
    skills: SKILLS.map((skill) => ({ skill, attempts: 0, accuracy: null, prev_attempts: 0, prev_accuracy: null })),
    exercise_types: EXERCISE_TYPES.map((exercise_type) => ({
      exercise_type,
      attempts: 0,
      accuracy: null,
      prev_attempts: 0,
      prev_accuracy: null,
    })),
    estimates: [],
    mistakes: [],
    motivation: {
      xp_total: 0,
      xp_week: 0,
      streak_current: 0,
      streak_best: 0,
      grace_left: 1,
      weekly_challenge: { target_days: 6, done_days: 0, completed: false, completed_weeks: 0 },
      badges: [],
      new_badges: [],
    },
    ...overrides,
  });
}
