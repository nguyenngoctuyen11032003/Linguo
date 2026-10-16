import {
  ADMIN_CONTENT_KINDS,
  ADMIN_STATUS_TRANSITIONS,
  CONTENT_STATUSES,
  adminContentDetailSchema,
  adminContentListSchema,
  adminSetStatusResultSchema,
  type AdminContentDetail,
  type AdminContentKind,
  type AdminContentList,
  type ContentStatus,
  type ReportTargetKind,
  type StaffRole,
} from '@linguo/shared';
import { callRpc, parse } from '@/features/lesson-player/service';
import type { AppSupabaseClient } from '@/lib/supabase';
import { hasStaffRole } from './service';

// Spec 11 §3–4: the "Nội dung" pages. admin_* RPCs are not in the generated Database types yet; callRpc goes through
// an untyped cast and every answer is validated with the shared zod contract.

export const CONTENT_PAGE_SIZE = 25;

export const CONTENT_STATUS_LABELS_VI: Record<ContentStatus, string> = {
  draft: 'Bản nháp',
  in_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  published: 'Đã xuất bản',
  archived: 'Đã lưu trữ',
};

export const CONTENT_LANGUAGES = ['en', 'ko', 'ja'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const CONTENT_LANGUAGE_LABELS_VI: Record<ContentLanguage, string> = { en: 'Tiếng Anh', ko: 'Tiếng Hàn', ja: 'Tiếng Nhật' };

export function isContentLanguage(value: string | null | undefined): value is ContentLanguage {
  return (CONTENT_LANGUAGES as readonly (string | null | undefined)[]).includes(value);
}

/** Only http(s) links are rendered as links (a source url is free text from the content repo). */
export function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function isContentKind(value: unknown): value is AdminContentKind {
  return typeof value === 'string' && (ADMIN_CONTENT_KINDS as readonly string[]).includes(value);
}

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === 'string' && (CONTENT_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: string): string {
  return isContentStatus(status) ? CONTENT_STATUS_LABELS_VI[status] : status;
}

export interface ContentFilters {
  kind: AdminContentKind;
  language: ContentLanguage | null;
  status: ContentStatus | null;
  search: string;
  /** 1-based. */
  page: number;
}

export const DEFAULT_CONTENT_FILTERS: ContentFilters = { kind: 'lesson', language: null, status: null, search: '', page: 1 };

/** Reads the list filters from the URL; unknown values fall back to the defaults. */
export function filtersFromParams(params: URLSearchParams): ContentFilters {
  const kind = params.get('loai');
  const language = params.get('ngon-ngu');
  const status = params.get('trang-thai');
  const page = Number(params.get('trang'));
  return {
    kind: isContentKind(kind) ? kind : DEFAULT_CONTENT_FILTERS.kind,
    language: isContentLanguage(language) ? language : null,
    status: isContentStatus(status) ? status : null,
    search: (params.get('q') ?? '').slice(0, 100),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Inverse of filtersFromParams; defaults are left out so the URL stays short. */
export function filtersToParams(filters: ContentFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.kind !== DEFAULT_CONTENT_FILTERS.kind) params.set('loai', filters.kind);
  if (filters.language) params.set('ngon-ngu', filters.language);
  if (filters.status) params.set('trang-thai', filters.status);
  const search = filters.search.trim();
  if (search) params.set('q', search);
  if (filters.page > 1) params.set('trang', String(filters.page));
  return params;
}

export function contentDetailPath(kind: AdminContentKind, id: string): string {
  return `/quan-tri/noi-dung/${kind}/${id}`;
}

export async function listContent(client: AppSupabaseClient, filters: ContentFilters, pageSize = CONTENT_PAGE_SIZE): Promise<AdminContentList> {
  const search = filters.search.trim();
  const data = await callRpc(client, 'admin_list_content', {
    p_kind: filters.kind,
    p_language: filters.language,
    p_status: filters.status,
    p_search: search === '' ? null : search,
    p_limit: pageSize,
    p_offset: (filters.page - 1) * pageSize,
  });
  return parse(adminContentListSchema, data);
}

export async function getContent(client: AppSupabaseClient, kind: AdminContentKind, id: string): Promise<AdminContentDetail> {
  return parse(adminContentDetailSchema, await callRpc(client, 'admin_get_content', { p_kind: kind, p_id: id }));
}

export interface SetStatusArgs {
  kind: AdminContentKind;
  id: string;
  status: ContentStatus;
  note: string | null;
  force: boolean;
}

export async function setContentStatus(client: AppSupabaseClient, args: SetStatusArgs): Promise<ContentStatus> {
  const note = args.note?.trim() ?? '';
  const data = await callRpc(client, 'admin_set_status', {
    p_kind: args.kind,
    p_id: args.id,
    p_status: args.status,
    p_note: note === '' ? null : note,
    p_force: args.force,
  });
  return parse(adminSetStatusResultSchema, data).status;
}

/** Statuses an exam question can have (its table only knows published/archived). */
const EXAM_QUESTION_STATUSES: readonly ContentStatus[] = ['published', 'archived'];

/** Valid next statuses for a row (spec 11 §3); empty for an unknown status. */
export function nextStatuses(kind: AdminContentKind, status: string): ContentStatus[] {
  if (!isContentStatus(status)) return [];
  const next = ADMIN_STATUS_TRANSITIONS[status];
  return kind === 'exam_question' ? next.filter((s) => EXAM_QUESTION_STATUSES.includes(s)) : [...next];
}

/** Reviewers and admins may change a status; editors only read. */
export function canChangeStatus(role: StaffRole | null): boolean {
  return hasStaffRole(role, 'reviewer');
}

/** Only admins may publish over open wrong_answer reports (p_force). */
export function canForcePublish(role: StaffRole | null): boolean {
  return hasStaffRole(role, 'admin');
}

/** Button label for moving a row from `from` to `to`. */
export function transitionLabel(from: string, to: ContentStatus): string {
  switch (to) {
    case 'in_review':
      return from === 'draft' ? 'Gửi duyệt' : 'Trả về chờ duyệt';
    case 'approved':
      return 'Duyệt';
    case 'published':
      return 'Xuất bản';
    case 'archived':
      return 'Lưu trữ';
    case 'draft':
      return from === 'archived' ? 'Khôi phục thành bản nháp' : 'Trả về bản nháp';
  }
}

const REPORTABLE: Partial<Record<AdminContentKind, ReportTargetKind>> = {
  exercise: 'exercise',
  learning_item: 'learning_item',
  lesson: 'lesson',
  assessment_item: 'assessment_item',
  exam_question: 'exam_question',
};

/** Report target kind of a content kind, or null when learners cannot report it. */
export function reportTargetKind(kind: AdminContentKind): ReportTargetKind | null {
  return REPORTABLE[kind] ?? null;
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * "2026-10-10" → "10/10/2026" as written; a timestamp ("2026-10-10T20:05:00+00:00") → its date in the viewer's
 * time zone, so an evening UTC update is not shown a day early in Vietnam. null → "—".
 */
export function formatAdminDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  if (iso.length > 10) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Link to the report queue filtered to a content kind (admin_list_reports has no per-target filter). */
export function reportsPath(kind: ReportTargetKind): string {
  return `/quan-tri/bao-loi?${new URLSearchParams({ loai: kind }).toString()}`;
}
