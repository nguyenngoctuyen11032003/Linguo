import {
  CLASS_LANGUAGES,
  LANGUAGES,
  LEVEL_INFO,
  TEACHER_LIMITS as L,
  type AssignmentKind,
  type ClassLanguage,
  type ExamAssignmentMode,
  type ExamAssignmentSection,
  type LevelCode,
  type TeacherAssignment,
  type TeacherRosterMember,
} from '@linguo/shared';

/** Languages a teacher can open a class in: the class languages that are offered to learners (LANGUAGES[code].available). */
export const CLASS_LANGUAGE_CHOICES: readonly ClassLanguage[] = CLASS_LANGUAGES.filter((code) => LANGUAGES[code].available);

export const CLASS_LANGUAGE_LABELS: Record<ClassLanguage, string> = {
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn',
  ja: 'Tiếng Nhật',
  de: 'Tiếng Đức',
};

export const ASSIGNMENT_KIND_LABELS: Record<AssignmentKind, string> = {
  lesson: 'Bài học',
  exam: 'Đề luyện thi',
  review: 'Ôn tập',
};

export const EXAM_SECTION_LABELS: Record<ExamAssignmentSection, string> = {
  listening: 'Nghe',
  reading: 'Đọc',
  writing: 'Viết',
};

/** How the learner is asked to take an exam assignment. */
export function examModeLabel(a: { exam_mode: ExamAssignmentMode | null; exam_section: ExamAssignmentSection | null }): string {
  if (a.exam_mode === 'full') return 'Làm trọn đề';
  if (a.exam_mode === 'section') return `Làm phần ${a.exam_section ? EXAM_SECTION_LABELS[a.exam_section] : ''}`.trim();
  return 'Học viên tự chọn cách làm';
}

/** Invite lifetimes offered in the form, in hours. */
export const INVITE_EXPIRY_CHOICES = [
  { hours: 24, label: '1 ngày' },
  { hours: L.inviteDefaultHours, label: '7 ngày' },
  { hours: L.inviteMaxHours, label: '30 ngày' },
] as const;

export function levelLabel(level: string): string {
  return (LEVEL_INFO as Record<string, { label: string } | undefined>)[level as LevelCode]?.label ?? level.toUpperCase();
}

const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "15/10/2026" in the viewer's time zone. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

/** "15/10, 14:30" in the viewer's time zone. */
export function formatDayTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME_FORMAT.format(date);
}

/** A learner-local day "YYYY-MM-DD" as "15/10/2026" (no time zone shift). */
export function formatLocalDay(day: string): string {
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : day;
}

/** "YYYY-MM-DD" of a Date in local time (for <input type="date"> bounds). */
export function localDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The end (23:59 local time) of a picked due day, as an ISO timestamp, or null for an invalid value. */
export function dueDayToIso(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Whether a picked due day is accepted by the server: in the future and within dueMaxDays. */
export function isDueDayAllowed(day: string, now: Date = new Date()): boolean {
  const iso = dueDayToIso(day);
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return at > now.getTime() && at <= now.getTime() + L.dueMaxDays * 86_400_000;
}

/** "68%" for a 0..1 share, or "—" when there is not enough data. */
export function formatShare(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** Completion share of an assignment, 0..100. */
export function completionPercent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * 100);
}

export function isOverdue(dueAt: string | null, now: Date = new Date()): boolean {
  return dueAt !== null && new Date(dueAt).getTime() < now.getTime();
}

/** What the teacher reads about the state of an assignment: closed, overdue with who is missing, or open. */
export function assignmentStatusLabel(
  a: Pick<TeacherAssignment, 'closed_at' | 'due_at' | 'completed_count' | 'member_count'>,
  now: Date = new Date(),
): { tone: 'closed' | 'overdue' | 'open'; text: string } {
  if (a.closed_at) return { tone: 'closed', text: 'Đã đóng' };
  const missing = Math.max(0, a.member_count - a.completed_count);
  if (isOverdue(a.due_at, now) && missing > 0) return { tone: 'overdue', text: `Quá hạn · ${missing} học viên chưa nộp` };
  if (isOverdue(a.due_at, now)) return { tone: 'open', text: 'Quá hạn · cả lớp đã nộp' };
  return { tone: 'open', text: 'Đang mở' };
}

/** "còn 3 ngày", "hôm nay", "quá hạn" relative to now. */
export function expiryLabel(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'đã hết hạn';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'còn dưới 1 giờ';
  if (hours < 24) return `còn ${hours} giờ`;
  return `còn ${Math.floor(hours / 24)} ngày`;
}

/** Same cleaning as the server (personal_clean): collapse whitespace, trim. */
export function cleanClassName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** What a teacher reads for an assignment: the lesson / exam title, or "Ôn N thẻ". */
export function assignmentTitle(a: Pick<TeacherAssignment, 'kind' | 'title' | 'target_count'>): string {
  if (a.kind === 'review') return `Ôn ${a.target_count ?? 0} thẻ`;
  return a.title ?? (a.kind === 'lesson' ? 'Bài học không còn khả dụng' : 'Đề không còn khả dụng');
}

export function memberName(m: Pick<TeacherRosterMember, 'display_name'>): string {
  return m.display_name?.trim() || 'Học viên chưa đặt tên';
}
