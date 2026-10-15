import { z } from 'zod';
import { LANGUAGE_CODES } from '../constants';

// Spec 4: JSON exchanged with start_diagnostic, answer_diagnostic,
// skip_diagnostic_skill, finish_diagnostic and accept_diagnostic_placement.
// snake_case mirrors the SQL jsonb exactly. Answer keys never appear here.

export const DIAGNOSTIC_SKILLS = ['vocabulary', 'grammar', 'reading'] as const;
export type DiagnosticSkill = (typeof DIAGNOSTIC_SKILLS)[number];

/** Skills shown in the report; listening/writing/speaking are never inferred in v1. */
export const REPORT_SKILLS = ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'speaking'] as const;
export type ReportSkill = (typeof REPORT_SKILLS)[number];

export const DIAGNOSTIC_MODES = ['full', 'foundation'] as const;
export type DiagnosticMode = (typeof DIAGNOSTIC_MODES)[number];

export const DIAGNOSTIC_ITEM_TYPES = ['mcq', 'cloze_choice', 'reading_mcq'] as const;
export const SKIP_REASONS = ['no_time', 'too_hard', 'not_my_goal', 'other'] as const;
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type DiagnosticConfidence = (typeof CONFIDENCE_LEVELS)[number];

/** Mirrors the Vietnamese error map in apps/web/src/features/diagnostic/error-map.ts. */
export const DIAGNOSTIC_ERROR_CODES = [
  'not_authenticated',
  'path_not_found',
  'diagnostic_cooldown',
  'bank_unavailable',
  'invalid_mode',
  'attempt_not_found',
  'attempt_not_active',
  'item_mismatch',
  'already_answered',
  'invalid_choice',
  'invalid_skill',
  'invalid_reason',
  'attempt_not_completed',
  'already_applied',
] as const;

const optionSchema = z.object({ id: z.string(), text: z.string(), lang: z.enum(['en', 'ko', 'ja', 'vi']) });

export const diagnosticItemSchema = z.object({
  id: z.uuid(),
  skill: z.enum(DIAGNOSTIC_SKILLS),
  item_type: z.enum(DIAGNOSTIC_ITEM_TYPES),
  prompt: z.object({
    stem: z.string(),
    stem_lang: z.enum(['en', 'ko', 'ja', 'vi']),
    /** reading_mcq only */
    passage: z.string().nullable().optional(),
    options: z.array(optionSchema).min(2).max(6),
  }),
});
export type DiagnosticItem = z.infer<typeof diagnosticItemSchema>;

export const diagnosticProgressSchema = z.object({
  skills: z.array(
    z.object({
      skill: z.enum(DIAGNOSTIC_SKILLS),
      status: z.enum(['pending', 'active', 'done', 'skipped']),
      /** 0..1 — how settled this skill's estimate is (1 − sd/initial_sd, clamped); never a question count. */
      fill: z.number().min(0).max(1),
    }),
  ),
  near_end: z.boolean(),
});
export type DiagnosticProgress = z.infer<typeof diagnosticProgressSchema>;

export const diagnosticStepSchema = z.object({
  attempt_id: z.uuid(),
  mode: z.enum(DIAGNOSTIC_MODES),
  /** null when the test is done (call finish_diagnostic). */
  item: diagnosticItemSchema.nullable(),
  progress: diagnosticProgressSchema,
  done: z.boolean(),
  resumed: z.boolean(),
});
export type DiagnosticStep = z.infer<typeof diagnosticStepSchema>;

export const reportSkillSchema = z.object({
  skill: z.enum(REPORT_SKILLS),
  status: z.enum(['estimated', 'skipped', 'not_supported', 'insufficient']),
  level_code: z.string().nullable(),
  range: z.object({ low: z.string(), high: z.string() }).nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable(),
  sample_size: z.number().int(),
  reason: z.string().nullable(),
});

export const diagnosticReportSchema = z.object({
  attempt_id: z.uuid(),
  learning_path_id: z.uuid(),
  language_code: z.enum(LANGUAGE_CODES),
  mode: z.enum(DIAGNOSTIC_MODES),
  completed_at: z.string(),
  skills: z.array(reportSkillSchema),
  current_level: z.string(),
  /** Lower median of medium/high-confidence skill levels; null when fewer than 2 such skills. */
  suggested_level: z.string().nullable(),
  /** Suggested level after the upward cap (+2 first diagnostic, +1 later); null when no suggestion. */
  capped_level: z.string().nullable(),
  early_stop: z.boolean(),
  rapid_answer_share: z.number(),
  bank_unreviewed: z.boolean(),
  applied_at: z.string().nullable(),
  /** Next time start_diagnostic is allowed (completed_at + cooldown). */
  retake_after: z.string(),
});
export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>;

export const placementResultSchema = z.object({
  learning_path_id: z.uuid(),
  previous_level: z.string(),
  new_level: z.string(),
  outcome: z.enum(['applied', 'unchanged', 'no_suggestion', 'needs_target_update']),
  estimate: z.record(z.string(), z.unknown()).nullable(),
});
export type PlacementResult = z.infer<typeof placementResultSchema>;

/** Latest attempt for a path (Home/settings entry points). */
export const diagnosticStatusSchema = z.object({
  attempt_id: z.uuid().nullable(),
  status: z.enum(['none', 'in_progress', 'completed', 'abandoned']),
  completed_at: z.string().nullable(),
  applied_at: z.string().nullable(),
  retake_after: z.string().nullable(),
  can_start: z.boolean(),
});
export type DiagnosticStatus = z.infer<typeof diagnosticStatusSchema>;
