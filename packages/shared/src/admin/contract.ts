import { z } from 'zod';
import { CONTENT_STATUSES, type ContentStatus } from '../content/authoring';

// Spec 11: content reports (learners) and the staff admin RPCs. snake_case mirrors the SQL jsonb exactly.

// ---------------------------------------------------------------------------
// Content reports (learner side)
// ---------------------------------------------------------------------------

/** Mirrors the Vietnamese error map in apps/web/src/features/content-reports/error-map.ts. */
export const CONTENT_REPORT_ERROR_CODES = [
  'not_authenticated',
  'invalid_target',
  'target_not_found',
  'invalid_reason',
  'note_too_long',
  'rate_limited',
] as const;
export type ContentReportErrorCode = (typeof CONTENT_REPORT_ERROR_CODES)[number];

export const REPORT_TARGET_KINDS = ['exercise', 'learning_item', 'lesson', 'assessment_item', 'exam_question'] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

export const REPORT_REASONS = ['wrong_answer', 'unclear', 'typo', 'audio', 'translation', 'offensive', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS_VI: Record<ReportReason, string> = {
  wrong_answer: 'Đáp án sai',
  unclear: 'Đề bài khó hiểu',
  typo: 'Lỗi chính tả',
  audio: 'Lỗi âm thanh',
  translation: 'Dịch chưa đúng',
  offensive: 'Nội dung không phù hợp',
  other: 'Lỗi khác',
};

export const REPORT_STATUSES = ['open', 'triaged', 'fixed', 'rejected', 'duplicate'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_RULES = { note_max: 500, resolution_note_max: 500, daily_limit: 20, duplicate_window_hours: 24 } as const;

/** report_content(p_target_kind, p_target_id, p_reason, p_note) → this. */
export const reportContentResultSchema = z.object({
  report_id: z.string().uuid(),
  /**
   * 'open', or 'duplicate' when an unresolved (open/triaged) report with the same reason and content version already
   * exists for the target, or when the caller already has an unresolved report on it (then report_id is that report).
   */
  status: z.enum(['open', 'duplicate']),
});
export type ReportContentResult = z.infer<typeof reportContentResultSchema>;

/** list_my_reports(p_limit int default 50) → array of this, newest first. */
export const myReportSchema = z.object({
  id: z.string().uuid(),
  target_kind: z.enum(REPORT_TARGET_KINDS),
  target_id: z.string().uuid(),
  /** Short human label of the target (lesson title, item headword, question prompt excerpt ≤ 80). */
  target_label: z.string().nullable(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().nullable(),
  status: z.enum(REPORT_STATUSES),
  resolution_note: z.string().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type MyReport = z.infer<typeof myReportSchema>;

// ---------------------------------------------------------------------------
// Staff / admin
// ---------------------------------------------------------------------------

/** Mirrors the Vietnamese error map in apps/web/src/features/admin/error-map.ts. */
export const ADMIN_ERROR_CODES = [
  'not_authenticated',
  'staff_forbidden',
  'invalid_kind',
  'content_not_found',
  'invalid_status_transition',
  'open_wrong_answer_reports',
  'invalid_report_status',
  'invalid_range',
  'invalid_role',
  /** admin_grant_role would remove or demote the last remaining admin. */
  'last_admin_required',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export const STAFF_ROLES = ['editor', 'reviewer', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
/** editor < reviewer < admin. */
export const STAFF_ROLE_RANK: Record<StaffRole, number> = { editor: 1, reviewer: 2, admin: 3 };

export const ADMIN_CONTENT_KINDS = [
  'program',
  'unit',
  'lesson',
  'learning_item',
  'exercise',
  'assessment_item',
  'exam_form',
  'exam_question',
] as const;
export type AdminContentKind = (typeof ADMIN_CONTENT_KINDS)[number];

/**
 * Transitions admin_set_status allows (spec 11 §3). Kinds whose table only has published/archived
 * (exam_question) or no status workflow reject everything else with invalid_status_transition.
 */
export const ADMIN_STATUS_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['published', 'in_review'],
  published: ['archived', 'in_review'],
  archived: ['draft'],
};

/** staff_role() → StaffRole | null. */
export const staffRoleSchema = z.enum(STAFF_ROLES).nullable();

/** admin_content_overview() */
export const adminOverviewSchema = z.object({
  counts: z.array(
    z.object({
      kind: z.enum(ADMIN_CONTENT_KINDS),
      language_code: z.string().nullable(),
      status: z.string(),
      count: z.number().int(),
    }),
  ),
  demo_count: z.number().int(),
  /** Published or approved rows with reviewed_at null (demo content shipped without review). */
  unreviewed_published_count: z.number().int(),
  open_report_count: z.number().int(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

/** admin_list_content(p_kind, p_language, p_status, p_search, p_limit, p_offset) */
export const adminContentRowSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ADMIN_CONTENT_KINDS),
  key: z.string().nullable(),
  /** Title / headword / prompt excerpt (≤ 120). */
  label: z.string(),
  language_code: z.string().nullable(),
  status: z.string(),
  is_demo: z.boolean(),
  version: z.number().int().nullable(),
  updated_at: z.string().nullable(),
  open_reports: z.number().int(),
});
export type AdminContentRow = z.infer<typeof adminContentRowSchema>;
export const adminContentListSchema = z.object({ items: z.array(adminContentRowSchema), total: z.number().int() });
export type AdminContentList = z.infer<typeof adminContentListSchema>;

/** admin_get_content(p_kind, p_id) */
export const adminContentDetailSchema = z.object({
  kind: z.enum(ADMIN_CONTENT_KINDS),
  id: z.string().uuid(),
  key: z.string().nullable(),
  status: z.string(),
  is_demo: z.boolean(),
  version: z.number().int().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().nullable(),
  /** The public row as stored (to_jsonb of the table row). */
  row: z.record(z.string(), z.unknown()),
  /** Answer key / explanation / script from content_private, or null when the kind has none. */
  private: z.record(z.string(), z.unknown()).nullable(),
  source: z
    .object({
      id: z.string().uuid(),
      key: z.string().nullable(),
      name: z.string(),
      license: z.string().nullable(),
      attribution: z.string().nullable(),
      url: z.string().nullable(),
    })
    .nullable(),
  revisions: z.array(
    z.object({ version: z.number().int(), content_hash: z.string().nullable(), created_at: z.string(), detail: z.unknown() }),
  ),
  /** Path of the YAML file under content/ that defines this row, when it can be derived from the key. */
  repo_path: z.string().nullable(),
});
export type AdminContentDetail = z.infer<typeof adminContentDetailSchema>;

/** admin_set_status(p_kind, p_id, p_status, p_note, p_force default false) → { status }. */
export const adminSetStatusResultSchema = z.object({ status: z.enum(CONTENT_STATUSES) });

/** admin_list_sources() */
export const adminSourceSchema = z.object({
  id: z.string().uuid(),
  key: z.string().nullable(),
  name: z.string(),
  license: z.string().nullable(),
  attribution: z.string().nullable(),
  url: z.string().nullable(),
  status: z.string(),
  usage_count: z.number().int(),
});
export type AdminSource = z.infer<typeof adminSourceSchema>;

/** admin_list_reports(p_status, p_kind, p_limit, p_offset): grouped by target. */
export const adminReportGroupSchema = z.object({
  target_kind: z.enum(REPORT_TARGET_KINDS),
  target_id: z.string().uuid(),
  target_label: z.string().nullable(),
  report_count: z.number().int(),
  reasons: z.record(z.string(), z.number().int()),
  latest_at: z.string(),
  reports: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.enum(REPORT_REASONS),
      note: z.string().nullable(),
      status: z.enum(REPORT_STATUSES),
      content_version: z.number().int().nullable(),
      created_at: z.string(),
    }),
  ),
});
export type AdminReportGroup = z.infer<typeof adminReportGroupSchema>;
export const adminReportListSchema = z.object({ groups: z.array(adminReportGroupSchema), total_groups: z.number().int() });
export type AdminReportList = z.infer<typeof adminReportListSchema>;

/** admin_resolve_report(p_report_ids uuid[], p_status, p_resolution_note) → { updated }. */
export const adminResolveResultSchema = z.object({ updated: z.number().int() });

export const ADMIN_ANALYTICS_RANGES = [7, 28, 90] as const;
export type AdminAnalyticsRange = (typeof ADMIN_ANALYTICS_RANGES)[number];

/** admin_analytics(p_days). Aggregates only — never user ids or emails. */
export const adminAnalyticsSchema = z.object({
  days: z.number().int(),
  daily: z.array(z.object({ day: z.string(), dau: z.number().int(), lessons_completed: z.number().int(), review_sessions: z.number().int(), exam_attempts: z.number().int() })),
  wau: z.number().int(),
  onboarding_completed: z.number().int(),
  funnel: z.object({
    signed_up: z.number().int(),
    onboarded: z.number().int(),
    first_lesson: z.number().int(),
    third_lesson: z.number().int(),
    returned_day7: z.number().int(),
  }),
  /** Anonymous client error reports (analytics event client_error): totals by kind and the top kind x route pairs. */
  client_errors: z
    .object({
      total: z.number().int(),
      by_kind: z.array(z.object({ kind: z.string(), count: z.number().int() })),
      top: z.array(z.object({ kind: z.string(), route: z.string().nullable(), count: z.number().int() })),
    })
    .default({ total: 0, by_kind: [], top: [] }),
});
export type AdminAnalytics = z.infer<typeof adminAnalyticsSchema>;

/** admin_ai_usage(p_days). */
export const adminAiUsageSchema = z.object({
  days: z.number().int(),
  by_task: z.array(z.object({ task: z.string(), status: z.string(), count: z.number().int() })),
  cache_hit_rate: z.number().min(0).max(1).nullable(),
  latency_p50_ms: z.number().nullable(),
  latency_p95_ms: z.number().nullable(),
  reports_by_reason: z.record(z.string(), z.number().int()),
});
export type AdminAiUsage = z.infer<typeof adminAiUsageSchema>;

/** admin_audit_log_recent(p_limit int default 100) (admin only). */
export const adminAuditEntrySchema = z.object({
  id: z.string().uuid(),
  actor: z.string().uuid().nullable(),
  actor_role: z.string().nullable(),
  action: z.string(),
  target_kind: z.string().nullable(),
  target_id: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;
