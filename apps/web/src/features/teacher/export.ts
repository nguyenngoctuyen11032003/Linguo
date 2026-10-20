import { buildCsv, type TeacherAssignment, type TeacherRosterMember } from '@linguo/shared';
import { assignmentStatusLabel, assignmentTitle, examModeLabel, localDateInput, memberName } from './format';

// Class summary exports (CSV). They hold only what the roster screen already shows the teacher: a member's display
// name and the aggregate numbers of teacher_class_roster. Never an email or user id, a quiz answer, an AI
// conversation or a personal word: those are not in the roster payload, and nothing here adds them.

const MEMBER_HEADER = [
  'Học viên',
  'Ngày vào lớp',
  'Có lộ trình của lớp',
  'Chuỗi ngày hiện tại',
  'Chuỗi ngày dài nhất',
  'Phút học (7 ngày)',
  'Phút học (30 ngày)',
  'Học gần nhất',
  'Bài học đã xong',
  'Bài học xong (7 ngày)',
  'Thẻ ôn đến hạn',
  'Lượt ôn (30 ngày)',
  'Tỉ lệ ôn đúng 30 ngày (%)',
  'Bài giao đã xong',
  'Tổng bài giao',
] as const;

function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : localDateInput(date);
}

/** One row per member: name, join date and the aggregates, with a header row (Vietnamese). */
export function buildRosterCsv(members: readonly TeacherRosterMember[]): string {
  return buildCsv([
    MEMBER_HEADER,
    ...members.map((m) => [
      memberName(m),
      day(m.joined_at),
      m.has_path ? 'Có' : 'Không',
      m.streak_current,
      m.streak_best,
      m.minutes_7d,
      m.minutes_30d,
      m.last_active_day ?? '',
      m.lessons_completed,
      m.lessons_completed_7d,
      m.reviews_due,
      m.reviews_30d,
      m.review_accuracy_30d === null ? '' : Math.round(m.review_accuracy_30d * 100),
      m.assignments_done,
      m.assignments_total,
    ]),
  ]);
}

const ASSIGNMENT_HEADER = [
  'Loại',
  'Nội dung',
  'Cách làm đề',
  'Ngày giao',
  'Hạn nộp',
  'Trạng thái',
  'Đã hoàn thành',
  'Số học viên',
  'Tỉ lệ hoàn thành (%)',
] as const;

const KIND_TEXT = { lesson: 'Bài học', exam: 'Đề luyện thi', review: 'Ôn tập' } as const;

/** One row per assignment with its completion count. The teacher's note is not exported. */
export function buildAssignmentsCsv(assignments: readonly TeacherAssignment[], now: Date = new Date()): string {
  return buildCsv([
    ASSIGNMENT_HEADER,
    ...assignments.map((a) => [
      KIND_TEXT[a.kind],
      assignmentTitle(a),
      a.kind === 'exam' ? examModeLabel(a) : '',
      day(a.created_at),
      a.due_at ? day(a.due_at) : '',
      assignmentStatusLabel(a, now).text,
      a.completed_count,
      a.member_count,
      a.member_count > 0 ? Math.round((Math.min(a.completed_count, a.member_count) / a.member_count) * 100) : '',
    ]),
  ]);
}

/** "lop-<name>-hoc-vien-2026-10-20.csv": the class name reduced to letters and digits (any script), at most 40 characters. */
export function exportFileName(className: string, what: 'hoc-vien' | 'bai-giao', date: Date = new Date()): string {
  const slug = className
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `lop-${slug || 'hoc'}-${what}-${localDateInput(date)}.csv`;
}
