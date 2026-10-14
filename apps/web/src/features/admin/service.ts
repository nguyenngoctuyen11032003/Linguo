import {
  adminAuditEntrySchema,
  adminOverviewSchema,
  adminReportListSchema,
  adminResolveResultSchema,
  adminSourceSchema,
  REPORT_RULES,
  staffRoleSchema,
  STAFF_ROLE_RANK,
  type AdminAuditEntry,
  type AdminContentKind,
  type AdminOverview,
  type AdminReportList,
  type AdminSource,
  type ReportStatus,
  type ReportTargetKind,
  type StaffRole,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

// Spec 11 §3–§4. The admin RPCs are not in the generated Database types yet: callRpc goes through an untyped cast
// and every payload is validated with the shared zod contract.

export const ADMIN_REPORT_PAGE_SIZE = 20;
export const ADMIN_AUDIT_DEFAULT_LIMIT = 100;

/** Statuses a staff member can move a report to from the queue. */
export const REPORT_RESOLVE_STATUSES = ['fixed', 'rejected', 'duplicate', 'triaged'] as const satisfies readonly ReportStatus[];
export type ReportResolveStatus = (typeof REPORT_RESOLVE_STATUSES)[number];

export const REPORT_STATUS_LABELS_VI: Record<ReportStatus, string> = {
  open: 'Đang mở',
  triaged: 'Đã tiếp nhận',
  fixed: 'Đã sửa',
  rejected: 'Không phải lỗi',
  duplicate: 'Trùng lặp',
};

export const REPORT_TARGET_LABELS_VI: Record<ReportTargetKind, string> = {
  exercise: 'Bài tập',
  learning_item: 'Mục từ',
  lesson: 'Bài học',
  assessment_item: 'Câu kiểm tra đầu vào',
  exam_question: 'Câu hỏi thi',
};

export const ADMIN_KIND_LABELS_VI: Record<AdminContentKind, string> = {
  program: 'Chương trình',
  unit: 'Chủ đề',
  lesson: 'Bài học',
  learning_item: 'Mục từ',
  exercise: 'Bài tập',
  assessment_item: 'Câu kiểm tra đầu vào',
  exam_form: 'Đề thi',
  exam_question: 'Câu hỏi thi',
};

export const STAFF_ROLE_LABELS_VI: Record<StaffRole, string> = {
  editor: 'Biên tập viên',
  reviewer: 'Người duyệt',
  admin: 'Quản trị viên',
};

const REPORT_TARGET_TO_ADMIN_KIND: Record<ReportTargetKind, AdminContentKind> = {
  exercise: 'exercise',
  learning_item: 'learning_item',
  lesson: 'lesson',
  assessment_item: 'assessment_item',
  exam_question: 'exam_question',
};

export function reportTargetToAdminKind(kind: ReportTargetKind): AdminContentKind {
  return REPORT_TARGET_TO_ADMIN_KIND[kind];
}

/** Admin content detail page of a reported target. */
export function adminContentPath(kind: ReportTargetKind, id: string): string {
  return `/quan-tri/noi-dung/${reportTargetToAdminKind(kind)}/${id}`;
}

/** True when `role` is at least `min` (editor < reviewer < admin). */
export function hasStaffRole(role: StaffRole | null | undefined, min: StaffRole): boolean {
  return role != null && STAFF_ROLE_RANK[role] >= STAFF_ROLE_RANK[min];
}

/** staff_role() → the caller's role, or null for learners. */
export async function getStaffRole(client: AppSupabaseClient): Promise<StaffRole | null> {
  const data = await callRpc(client, 'staff_role', {});
  return parse(staffRoleSchema, data ?? null);
}

export async function getAdminOverview(client: AppSupabaseClient): Promise<AdminOverview> {
  return parse(adminOverviewSchema, await callRpc(client, 'admin_content_overview', {}));
}

export async function listAdminSources(client: AppSupabaseClient): Promise<AdminSource[]> {
  const data = await callRpc(client, 'admin_list_sources', {});
  return parse(adminSourceSchema.array(), data ?? []);
}

export interface AdminReportQuery {
  /** null = every status. */
  status: ReportStatus | null;
  /** null = every kind. */
  kind: ReportTargetKind | null;
  /** Zero-based page. */
  page: number;
  pageSize?: number;
}

export async function listAdminReports(client: AppSupabaseClient, query: AdminReportQuery): Promise<AdminReportList> {
  const limit = query.pageSize ?? ADMIN_REPORT_PAGE_SIZE;
  const data = await callRpc(client, 'admin_list_reports', {
    p_status: query.status,
    p_kind: query.kind,
    p_limit: limit,
    p_offset: Math.max(0, query.page) * limit,
  });
  return parse(adminReportListSchema, data);
}

/** admin_resolve_report → number of reports updated. The note is trimmed; an empty note is sent as null. */
export async function resolveAdminReports(
  client: AppSupabaseClient,
  reportIds: readonly string[],
  status: ReportResolveStatus,
  note: string,
): Promise<number> {
  if (reportIds.length === 0) return 0;
  const trimmed = note.trim();
  if (trimmed.length > REPORT_RULES.resolution_note_max) throw new Error('note_too_long');
  const data = await callRpc(client, 'admin_resolve_report', {
    p_report_ids: [...reportIds],
    p_status: status,
    p_resolution_note: trimmed === '' ? null : trimmed,
  });
  return parse(adminResolveResultSchema, data).updated;
}

export async function listAdminAuditLog(client: AppSupabaseClient, limit = ADMIN_AUDIT_DEFAULT_LIMIT): Promise<AdminAuditEntry[]> {
  const data = await callRpc(client, 'admin_audit_log_recent', { p_limit: limit });
  return parse(adminAuditEntrySchema.array(), data ?? []);
}
