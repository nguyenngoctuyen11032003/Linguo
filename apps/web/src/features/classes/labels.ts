import type { AssignmentKind, ClassLanguage, LearnerAssignment } from '@linguo/shared';

/** Vietnamese names of the class languages (classes also allow Japanese, which has no learning path yet). */
export const CLASS_LANGUAGE_LABELS: Record<ClassLanguage, string> = {
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn',
  ja: 'Tiếng Nhật',
  de: 'Tiếng Đức',
};

export const ASSIGNMENT_KIND_LABELS: Record<AssignmentKind, string> = {
  lesson: 'Bài học',
  exam: 'Luyện thi',
  review: 'Ôn tập',
};

/** What the learner reads as the assignment's name. */
export function assignmentTitle(a: Pick<LearnerAssignment, 'kind' | 'title' | 'target_count'>): string {
  if (a.kind === 'review') return `Ôn ${a.target_count ?? 0} thẻ`;
  if (a.title) return a.title;
  return a.kind === 'lesson' ? 'Bài học' : 'Đề luyện thi';
}

/**
 * Where the learner does the assignment. Lessons open directly; an exam form opens the exam hub on that form
 * (`?de=<form id>`: the learner still picks the mode, and the hub explains when the form is not available); a review
 * assignment counts any graded review in the class language.
 */
export function assignmentLink(a: Pick<LearnerAssignment, 'kind' | 'ref_id'>): string {
  if (a.kind === 'lesson' && a.ref_id) return `/app/hoc-tap/bai/${a.ref_id}`;
  if (a.kind === 'exam') return a.ref_id ? `/app/luyen-thi?de=${encodeURIComponent(a.ref_id)}` : '/app/luyen-thi';
  return '/app/on-tap';
}

/** Call to action on an assignment row. */
export function assignmentAction(a: Pick<LearnerAssignment, 'kind' | 'state'>): string {
  const done = a.state === 'done';
  if (a.kind === 'lesson') return done ? 'Học lại' : 'Làm bài';
  if (a.kind === 'exam') return done ? 'Làm lại đề' : 'Làm đề';
  return done ? 'Ôn thêm' : 'Ôn ngay';
}

/** Short status shown next to the title. Reviews show their progress while open. */
export function assignmentStatus(a: Pick<LearnerAssignment, 'kind' | 'state' | 'progress_count' | 'target_count'>): string {
  if (a.state === 'done') return 'Đã xong';
  if (a.kind === 'review' && a.target_count) {
    const progress = `Đã ôn ${a.progress_count}/${a.target_count}`;
    return a.state === 'overdue' ? `Quá hạn · ${progress}` : progress;
  }
  return a.state === 'overdue' ? 'Quá hạn' : 'Chưa làm';
}

const DUE_FORMATS = new Map<string, Intl.DateTimeFormat>();

function dueFormat(timeZone: string): Intl.DateTimeFormat {
  let format = DUE_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
    DUE_FORMATS.set(timeZone, format);
  }
  return format;
}

/** "Hạn: 20:00 thứ Hai, 20/10" in the learner's zone (pass a zone already checked with resolveTimeZone). */
export function formatDue(dueAt: string | null, timeZone: string): string {
  if (!dueAt) return 'Không có hạn';
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return 'Không có hạn';
  return `Hạn: ${dueFormat(timeZone).format(date)}`;
}

/** Toast after joining a class. */
export function joinedMessage(klass: { name: string }, alreadyMember: boolean): string {
  return alreadyMember ? `Bạn đã ở trong lớp ${klass.name} rồi.` : `Đã vào lớp ${klass.name}. Chào mừng bạn!`;
}

/** "14/10/2026" in the learner's zone. */
export function formatJoined(joinedAt: string, timeZone: string): string {
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(date);
}
