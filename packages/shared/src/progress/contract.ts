import { z } from 'zod';
import { SKILLS } from '../constants';

// Spec 8: JSON exchanged with get_progress_dashboard, track_events and the
// motivation preferences. snake_case mirrors the SQL jsonb exactly.

/** Mirrors the Vietnamese error map in apps/web/src/features/progress/error-map.ts. */
export const PROGRESS_ERROR_CODES = [
  'not_authenticated',
  'path_not_found',
  'invalid_range',
  'invalid_event',
  'rate_limited',
] as const;
export type ProgressErrorCode = (typeof PROGRESS_ERROR_CODES)[number];

export const PROGRESS_RANGES = [7, 14, 28] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];

/** Below this many graded answers a skill/type accuracy is shown as "Chưa đủ dữ liệu". */
export const MIN_ACCURACY_SAMPLE = 10;

// ---------------------------------------------------------------------------
// XP and streak rules (PRD §10.3). The SQL triggers implement the same numbers;
// supabase/tests/progress.test.sql asserts them. No speed bonus anywhere.
// ---------------------------------------------------------------------------
export const XP_RULES = {
  /** First attempt at an exercise, correct, without reveal. */
  attempt_correct: 2,
  /** First attempt judged "almost". */
  attempt_almost: 1,
  /** review_logs kind = 'grade' with rating_effective >= 2. */
  review_recalled: 1,
  lesson_completed: 10,
  /** Extra when the completed run's overall first-try accuracy >= 0.8. */
  lesson_accurate_bonus: 5,
  /** Hard cap per learner-local day per path, so grinding is not rewarded. */
  daily_cap: 300,
} as const;

/**
 * A day counts as active when ANY holds: a lesson completed, >= 10 reviews graded,
 * or >= 5 active minutes. Streak walks back over days the path schedules
 * (weekly_minutes[isodow] > 0); unscheduled days are rest days and never break it.
 * One missed scheduled day per ISO week is forgiven (grace).
 */
export const STREAK_RULES = {
  active_min_reviews: 10,
  active_min_minutes: 5,
  grace_per_week: 1,
} as const;

/** Active time per answer is min(response_ms, cap) — idle tabs do not inflate minutes. */
export const ACTIVE_MS_CAP_PER_ANSWER = 120_000;

// ---------------------------------------------------------------------------
// Badges. Catalogue lives here; SQL stores only (badge_key, earned_at).
// ---------------------------------------------------------------------------
export const BADGE_KEYS = [
  'first_lesson',
  'lessons_10',
  'lessons_50',
  'reviews_100',
  'reviews_1000',
  'mastered_25',
  'mastered_100',
  'streak_7',
  'streak_30',
  'diagnostic_done',
  'weekly_challenge_4',
  'skill_vocabulary',
  'skill_grammar',
  'skill_reading',
  'skill_listening',
  'skill_writing',
  'skill_speaking',
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

export interface BadgeInfo {
  key: BadgeKey;
  title_vi: string;
  description_vi: string;
  /** lucide-react icon name. */
  icon: string;
}

const skillBadge = (skill: (typeof SKILLS)[number], label: string): BadgeInfo => ({
  key: `skill_${skill}` as BadgeKey,
  title_vi: `Vững ${label}`,
  description_vi: `Đúng ≥ 80% trên ít nhất 30 câu ${label.toLowerCase()} trong 28 ngày`,
  icon: 'Target',
});

export const BADGES: Record<BadgeKey, BadgeInfo> = {
  first_lesson: { key: 'first_lesson', title_vi: 'Bài đầu tiên', description_vi: 'Hoàn thành bài học đầu tiên', icon: 'Flag' },
  lessons_10: { key: 'lessons_10', title_vi: '10 bài học', description_vi: 'Hoàn thành 10 bài học', icon: 'BookOpen' },
  lessons_50: { key: 'lessons_50', title_vi: '50 bài học', description_vi: 'Hoàn thành 50 bài học', icon: 'Library' },
  reviews_100: { key: 'reviews_100', title_vi: '100 lượt ôn', description_vi: 'Ôn 100 thẻ', icon: 'Repeat' },
  reviews_1000: { key: 'reviews_1000', title_vi: '1000 lượt ôn', description_vi: 'Ôn 1000 thẻ', icon: 'Repeat2' },
  mastered_25: { key: 'mastered_25', title_vi: 'Nhớ chắc 25 mục', description_vi: '25 mục đạt trạng thái thành thạo', icon: 'Brain' },
  mastered_100: { key: 'mastered_100', title_vi: 'Nhớ chắc 100 mục', description_vi: '100 mục đạt trạng thái thành thạo', icon: 'BrainCircuit' },
  streak_7: { key: 'streak_7', title_vi: 'Đều đặn 7 buổi', description_vi: 'Chuỗi 7 ngày học theo lịch', icon: 'CalendarCheck' },
  streak_30: { key: 'streak_30', title_vi: 'Đều đặn 30 buổi', description_vi: 'Chuỗi 30 ngày học theo lịch', icon: 'CalendarHeart' },
  diagnostic_done: { key: 'diagnostic_done', title_vi: 'Biết mình ở đâu', description_vi: 'Hoàn thành bài kiểm tra đầu vào', icon: 'Compass' },
  weekly_challenge_4: { key: 'weekly_challenge_4', title_vi: '4 tuần đạt mục tiêu', description_vi: 'Hoàn thành thử thách tuần 4 lần', icon: 'Trophy' },
  skill_vocabulary: skillBadge('vocabulary', 'Từ vựng'),
  skill_grammar: skillBadge('grammar', 'Ngữ pháp'),
  skill_reading: skillBadge('reading', 'Đọc'),
  skill_listening: skillBadge('listening', 'Nghe'),
  skill_writing: skillBadge('writing', 'Viết'),
  skill_speaking: skillBadge('speaking', 'Nói'),
};

// ---------------------------------------------------------------------------
// get_progress_dashboard(p_path_id uuid, p_range_days int) -> jsonb
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activityDaySchema = z.object({
  date: isoDate,
  minutes: z.number().int().min(0),
  xp: z.number().int().min(0),
  lessons: z.number().int().min(0),
  reviews: z.number().int().min(0),
  answers: z.number().int().min(0),
  /** weekly_minutes[isodow] of the path for that day (0 = rest day). */
  goal_minutes: z.number().int().min(0),
  active: z.boolean(),
});
export type ActivityDay = z.infer<typeof activityDaySchema>;

/** accuracy is null when attempts < MIN_ACCURACY_SAMPLE. */
const accuracyRowBase = {
  attempts: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).nullable(),
  /** Same metric over the previous window of equal length. */
  prev_attempts: z.number().int().min(0),
  prev_accuracy: z.number().min(0).max(1).nullable(),
};

export const skillAccuracySchema = z.object({ skill: z.enum(SKILLS), ...accuracyRowBase });
export type SkillAccuracy = z.infer<typeof skillAccuracySchema>;

export const typeAccuracySchema = z.object({
  exercise_type: z.enum(['mcq', 'fill_blank', 'word_bank', 'translate', 'listen']),
  ...accuracyRowBase,
});
export type TypeAccuracy = z.infer<typeof typeAccuracySchema>;

export const skillEstimateSchema = z.object({
  skill: z.enum(SKILLS),
  level_code: z.string(),
  confidence: z.enum(['self_reported', 'low', 'medium', 'high']),
  source: z.enum(['self_report', 'diagnostic', 'assessment']),
  sample_size: z.number().int().min(0),
  assessed_at: z.string(),
});
export type SkillEstimate = z.infer<typeof skillEstimateSchema>;

export const mistakeSchema = z.object({
  /** Exercise prompt text (vi or target language) truncated to 120 chars. */
  prompt: z.string(),
  lesson_id: z.uuid(),
  lesson_title: z.string(),
  wrong_count: z.number().int().min(1),
  last_wrong_at: z.string(),
});
export type Mistake = z.infer<typeof mistakeSchema>;

export const earnedBadgeSchema = z.object({
  key: z.enum(BADGE_KEYS),
  earned_at: z.string(),
});

export const motivationSchema = z.object({
  xp_total: z.number().int().min(0),
  xp_week: z.number().int().min(0),
  streak_current: z.number().int().min(0),
  streak_best: z.number().int().min(0),
  /** Grace misses still available in the current ISO week (0..grace_per_week). */
  grace_left: z.number().int().min(0),
  weekly_challenge: z.object({
    /** Scheduled (goal_minutes > 0) days in this ISO week. */
    target_days: z.number().int().min(0),
    done_days: z.number().int().min(0),
    completed: z.boolean(),
    completed_weeks: z.number().int().min(0),
  }),
  badges: z.array(earnedBadgeSchema),
  /** Badges first awarded during this call — the UI celebrates them once. */
  new_badges: z.array(z.enum(BADGE_KEYS)),
});
export type Motivation = z.infer<typeof motivationSchema>;

export const progressDashboardSchema = z.object({
  path_id: z.uuid(),
  range_days: z.union([z.literal(7), z.literal(14), z.literal(28)]),
  today: isoDate,
  /** Oldest → newest, exactly range_days entries ending today. */
  days: z.array(activityDaySchema),
  totals: z.object({
    today_minutes: z.number().int().min(0),
    week_minutes: z.number().int().min(0),
    week_goal_minutes: z.number().int().min(0),
    range_minutes: z.number().int().min(0),
    lessons_completed: z.number().int().min(0),
    reviews_done: z.number().int().min(0),
    /** Correct first attempts at stage = 'application' in range (bài vận dụng). */
    application_done: z.number().int().min(0),
  }),
  skills: z.array(skillAccuracySchema),
  exercise_types: z.array(typeAccuracySchema),
  estimates: z.array(skillEstimateSchema),
  mistakes: z.array(mistakeSchema).max(10),
  /** null when user_preferences.show_motivation = false. */
  motivation: motivationSchema.nullable(),
});
export type ProgressDashboard = z.infer<typeof progressDashboardSchema>;

// ---------------------------------------------------------------------------
// Preferences: user_preferences.show_motivation, user_preferences.analytics_opt_out,
// updated directly through the existing column-level UPDATE grant (like theme).
// ---------------------------------------------------------------------------
export const motivationPrefsSchema = z.object({
  show_motivation: z.boolean(),
  analytics_opt_out: z.boolean(),
});
export type MotivationPrefs = z.infer<typeof motivationPrefsSchema>;

// ---------------------------------------------------------------------------
// Internal analytics (PRD §13.1 "bảng sự kiện nội bộ tối thiểu").
// track_events(p_events jsonb) -> integer (rows stored). Max 20 events per call,
// 120 per minute per user; silently returns 0 when analytics_opt_out.
// Props are an allowlisted, PII-free bag: strings ≤ 64 chars, numbers, booleans.
// ---------------------------------------------------------------------------
export const ANALYTICS_EVENTS = [
  'page_view',
  'onboarding_completed',
  'diagnostic_started',
  'diagnostic_completed',
  'lesson_started',
  'lesson_completed',
  'review_session_completed',
  'ai_sheet_opened',
  'progress_viewed',
  'exam_started',
  'exam_completed',
  'badge_earned',
  'client_error',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const analyticsPropsSchema = z
  .record(z.string().regex(/^[a-z_]{1,32}$/), z.union([z.string().max(64), z.number(), z.boolean()]))
  .refine((v) => Object.keys(v).length <= 8, 'too_many_props');

export const analyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  props: analyticsPropsSchema,
  /** Client ISO timestamp; server stores created_at = now() and keeps this as client_at. */
  at: z.string(),
  /** Route pattern only, e.g. "/app/hoc-tap/bai/:lessonId" — never a concrete id or query. */
  route: z.string().max(80).nullable(),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export const ANALYTICS_BATCH_MAX = 20;

// client_error (privacy-preserving crash reports). props are a strict whitelist mirrored by track_events: kind +
// optional code (name/short code, never a message), build (version token) and online. The event's route is a
// path template. The server stores at most 20 per user per hour and silently drops the rest.
export const CLIENT_ERROR_KINDS = ['render_error', 'unhandled_rejection', 'window_error', 'chunk_load_error', 'rpc_error'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];
export const CLIENT_ERROR_CODE_MAX = 60;
export const clientErrorPropsSchema = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    code: z.string().regex(/^[A-Za-z0-9_.:-]{1,60}$/).optional(),
    build: z.string().regex(/^[A-Za-z0-9_.+-]{1,40}$/).optional(),
    online: z.boolean().optional(),
  })
  .strict();
export type ClientErrorProps = z.infer<typeof clientErrorPropsSchema>;
