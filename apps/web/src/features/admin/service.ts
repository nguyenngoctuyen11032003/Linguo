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
import { z } from 'zod';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';

const openReportCountSchema = z.number().int().nonnegative();

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
  /** One content row (needs `kind`): only its group, see findAdminReportGroup. */
  targetId?: string | null;
}

/** Groups fetched per call while looking for one target (admin_list_reports caps p_limit at 200). */
export const ADMIN_REPORT_SCAN_PAGE_SIZE = 200;
const ADMIN_REPORT_SCAN_MAX_PAGES = 25;

/**
 * The queue narrowed to one content row. admin_list_reports has no per-target filter, so this pages through the
 * groups of the kind (200 at a time) until it finds the target. At most one group; total_groups is 0 or 1.
 */
export async function findAdminReportGroup(
  client: AppSupabaseClient,
  query: { status: ReportStatus | null; kind: ReportTargetKind; targetId: string },
): Promise<AdminReportList> {
  for (let page = 0; page < ADMIN_REPORT_SCAN_MAX_PAGES; page++) {
    const list = await listAdminReports(client, { status: query.status, kind: query.kind, page, pageSize: ADMIN_REPORT_SCAN_PAGE_SIZE });
    const group = list.groups.find((g) => g.target_kind === query.kind && g.target_id === query.targetId);
    if (group) return { groups: [group], total_groups: 1 };
    if ((page + 1) * ADMIN_REPORT_SCAN_PAGE_SIZE >= list.total_groups) break;
  }
  return { groups: [], total_groups: 0 };
}

export async function listAdminReports(client: AppSupabaseClient, query: AdminReportQuery): Promise<AdminReportList> {
  if (query.targetId && query.kind) return findAdminReportGroup(client, { status: query.status, kind: query.kind, targetId: query.targetId });
  const limit = query.pageSize ?? ADMIN_REPORT_PAGE_SIZE;
  const data = await callRpc(client, 'admin_list_reports', {
    p_status: query.status,
    p_kind: query.kind,
    p_limit: limit,
    p_offset: Math.max(0, query.page) * limit,
  });
  return parse(adminReportListSchema, data);
}

/** admin_item_open_reports → unresolved (open or triaged) reports on one content row (editor+). */
export async function getAdminItemOpenReports(client: AppSupabaseClient, kind: ReportTargetKind, id: string): Promise<number> {
  return parse(openReportCountSchema, await callRpc(client, 'admin_item_open_reports', { p_kind: kind, p_id: id }));
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
