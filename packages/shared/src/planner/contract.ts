import { z } from 'zod';

// Spec 6: JSON exchanged with get_session_inputs, save_session_plan, get_today_session,
// update_session_item, reorder_session and finish_session. snake_case mirrors the SQL jsonb.

export const SESSION_LENGTHS = [10, 15, 30, 45, 60, 90, 120] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export const ACTIVITY_KINDS = ['review', 'lesson', 'practice', 'recap'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_STATUSES = ['pending', 'done', 'skipped'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const SESSION_STATUSES = ['planned', 'in_progress', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PLANNER_SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'] as const;
export type PlannerSkill = (typeof PLANNER_SKILLS)[number];

/** Mirrors the Vietnamese error map in apps/web/src/features/session/error-map.ts. */
export const SESSION_ERROR_CODES = [
  'not_authenticated',
  'path_not_found',
  'path_not_active',
  'session_not_found',
  'session_closed',
  'invalid_plan',
  'invalid_order',
  'item_not_found',
] as const;
export type SessionErrorCode = (typeof SESSION_ERROR_CODES)[number];

const candidateLessonSchema = z.object({
  lesson_id: z.uuid(),
  title_vi: z.string(),
  estimated_minutes: z.number().int().min(1),
  skills: z.array(z.string()),
  /** 'in_progress' lessons are resumed before new ones. */
  run_status: z.enum(['not_started', 'in_progress']),
  unit_order: z.number().int(),
  lesson_order: z.number().int(),
});
export type CandidateLesson = z.infer<typeof candidateLessonSchema>;

/** get_session_inputs(p_path_id) → everything the pure planner needs; no content bodies. */
export const sessionInputsSchema = z.object({
  path_id: z.uuid(),
  language_code: z.enum(['en', 'ko', 'ja']),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Minutes planned for today in learning_paths.weekly_minutes (Mon=0). */
  daily_goal_minutes: z.number().int().min(0),
  /** Seconds already logged in today's session items for this path. */
  studied_seconds_today: z.number().int().min(0),
  due_count: z.number().int().min(0),
  /** Due before the start of the learner's local today. */
  overdue_count: z.number().int().min(0),
  new_card_count: z.number().int().min(0),
  /** Up to 5 next unlocked lessons in path order (prerequisites met, not completed). */
  next_lessons: z.array(candidateLessonSchema).max(5),
  /** Latest estimate per skill; weakest first. Empty when no data yet. */
  skills: z.array(
    z.object({
      skill: z.enum(PLANNER_SKILLS),
      level_code: z.string(),
      confidence: z.enum(['self_reported', 'low', 'medium', 'high']),
      /** Recent attempt accuracy 0..1 over the last 14 days; null when < 5 attempts. */
      recent_accuracy: z.number().min(0).max(1).nullable(),
    }),
  ),
  /** Days since the last completed lesson/review/session; null = never studied. */
  days_since_last_study: z.number().int().min(0).nullable(),
});
export type SessionInputs = z.infer<typeof sessionInputsSchema>;

export const sessionActivitySchema = z.object({
  /** Stable within a session: 'a1', 'a2', ... */
  id: z.string().regex(/^a\d{1,2}$/),
  kind: z.enum(ACTIVITY_KINDS),
  minutes: z.number().int().min(1).max(120),
  /** kind='lesson' | 'practice': the lesson to open. */
  lesson_id: z.uuid().nullable(),
  /** kind='review': max cards to take from the due queue. */
  review_limit: z.number().int().min(1).max(500).nullable(),
  title_vi: z.string().min(1).max(120),
  /** Why the planner chose this (PRD §5.4 "Vì sao hệ thống chọn nội dung này?"). */
  reason_vi: z.string().min(1).max(200),
  /** Higher = kept first when the learner shortens the session. */
  priority: z.number().int().min(0).max(100),
  status: z.enum(ACTIVITY_STATUSES),
  seconds_spent: z.number().int().min(0),
});
export type SessionActivity = z.infer<typeof sessionActivitySchema>;

/** Output of the pure planner; also the p_plan argument of save_session_plan. */
export const sessionPlanSchema = z.object({
  minutes: z.number().int().min(5).max(120),
  activities: z.array(sessionActivitySchema).min(1).max(12),
  /** Short headline for the home card, e.g. "Ưu tiên ôn tập: 42 thẻ đến hạn". */
  focus_vi: z.string().min(1).max(160),
  /** true when new content was reduced because of a review backlog or a long break. */
  backlog_mode: z.boolean(),
});
export type SessionPlan = z.infer<typeof sessionPlanSchema>;

export const studySessionSchema = z.object({
  id: z.uuid(),
  path_id: z.uuid(),
  local_date: z.string(),
  status: z.enum(SESSION_STATUSES),
  minutes_planned: z.number().int(),
  plan: sessionPlanSchema,
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
export type StudySession = z.infer<typeof studySessionSchema>;

/** get_today_session(p_path_id) → the open (planned/in_progress) or latest session for today, or null. */
export const todaySessionResultSchema = z.object({
  session: studySessionSchema.nullable(),
  studied_seconds_today: z.number().int().min(0),
  daily_goal_minutes: z.number().int().min(0),
});
export type TodaySessionResult = z.infer<typeof todaySessionResultSchema>;

export const saveSessionPlanArgsSchema = z.object({
  p_path_id: z.uuid(),
  p_plan: sessionPlanSchema,
  /** true replaces today's open session (it becomes 'abandoned'). */
  p_replace: z.boolean(),
});

export const updateSessionItemArgsSchema = z.object({
  p_session_id: z.uuid(),
  p_item_id: z.string(),
  p_status: z.enum(ACTIVITY_STATUSES),
  /** Added to seconds_spent; server clamps to 0..7200 per call. */
  p_seconds: z.number().int().min(0),
});

export const reorderSessionArgsSchema = z.object({
  p_session_id: z.uuid(),
  /** Must be a permutation of the session's activity ids. */
  p_order: z.array(z.string()),
});

export const finishSessionArgsSchema = z.object({
  p_session_id: z.uuid(),
  p_status: z.enum(['completed', 'abandoned']),
});

/** Query params used to return from a lesson/review to the running session. */
export const SESSION_QUERY = { session: 'phien', item: 'muc' } as const;
