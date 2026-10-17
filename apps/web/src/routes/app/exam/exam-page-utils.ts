import type { ExamFamily, ExamFormSummary, ExamMode, ExamSection, GoalType } from '@linguo/shared';

/** The exam family a path goal prepares for, if any: the hub filter starts there. */
export function goalFamily(goal: GoalType | null | undefined): ExamFamily | null {
  if (goal === 'topik_i' || goal === 'topik_ii' || goal === 'cefr' || goal === 'jlpt' || goal === 'goethe') return goal;
  return null;
}

/**
 * PRD §9.2 warning on a hub card when the form does not match the path goal. Mirrors
 * public.exam_structure_warning (latest: supabase/migrations/20261018130000_japanese.sql), which start_exam returns as
 * structure_warning_vi once the attempt exists.
 */
export function structureWarning(goal: GoalType | null | undefined, family: ExamFamily): string | null {
  if (goal === 'topik_ii' && family === 'topik_i') {
    return 'Đề này theo cấu trúc TOPIK I, khác mục tiêu TOPIK II của lộ trình. Kết quả chỉ để tham khảo.';
  }
  if (goal === 'topik_i' && family === 'topik_ii') {
    return 'Đề này theo cấu trúc TOPIK II, khác mục tiêu TOPIK I của lộ trình. Kết quả chỉ để tham khảo.';
  }
  if (goal === 'cefr' && family !== 'cefr') {
    return 'Đề này không theo khung CEFR, khác mục tiêu CEFR của lộ trình. Kết quả chỉ để tham khảo.';
  }
  if (goal === 'jlpt' && family !== 'jlpt') {
    return 'Đề này không theo cấu trúc JLPT, khác mục tiêu JLPT của lộ trình. Kết quả chỉ để tham khảo.';
  }
  if (goal === 'goethe' && family !== 'goethe') {
    return 'Đề này không theo cấu trúc Goethe, khác mục tiêu Goethe của lộ trình. Kết quả chỉ để tham khảo.';
  }
  return null;
}

/** Analytics props of exam_started / exam_completed (spec 9 §4): family, mode and section only. */
export function examEventProps(a: { family: ExamFamily; mode: ExamMode; section?: ExamSection | null }): Record<string, string> {
  return a.section ? { family: a.family, mode: a.mode, section: a.section } : { family: a.family, mode: a.mode };
}

/** Plays allowed per listening question: twice in a timed full mock, unlimited in practice (spec 9 §4). */
export function listenLimitFor(mode: ExamMode): number | null {
  return mode === 'full' ? 2 : null;
}

/** Total minutes of the form's timed full mock; 0 when no section is timed (then no confirmation is needed). */
export function fullMockMinutes(form: Pick<ExamFormSummary, 'sections'>): number {
  return form.sections.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
}

export const EXAM_HUB_PATH = '/app/luyen-thi';
