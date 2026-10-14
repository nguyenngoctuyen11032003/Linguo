import type { SkillAccuracy, SkillEstimate, TypeAccuracy } from '@linguo/shared';
import { formatDateVi, todayIso } from '@/lib/dates';
import { CONFIDENCE_LABELS, SKILL_LABELS } from '../diagnostic/labels';

export { SKILL_LABELS };

export const EXERCISE_TYPE_LABELS: Record<TypeAccuracy['exercise_type'], string> = {
  mcq: 'Trắc nghiệm',
  fill_blank: 'Điền vào chỗ trống',
  word_bank: 'Sắp xếp từ',
  translate: 'Dịch câu',
  listen: 'Nghe và chọn',
};

export const ESTIMATE_CONFIDENCE_LABELS: Record<SkillEstimate['confidence'], string> = {
  ...CONFIDENCE_LABELS,
  self_reported: 'Tự đánh giá',
};

export const ESTIMATE_SOURCE_LABELS: Record<SkillEstimate['source'], string> = {
  self_report: 'Bạn tự đánh giá',
  diagnostic: 'Kiểm tra đầu vào',
  assessment: 'Bài đánh giá',
};

export interface AccuracyRow {
  key: string;
  label: string;
  attempts: number;
  accuracy: number | null;
  prev_accuracy: number | null;
}

export function skillAccuracyRows(skills: SkillAccuracy[]): AccuracyRow[] {
  return skills.map((s) => ({
    key: s.skill,
    label: SKILL_LABELS[s.skill],
    attempts: s.attempts,
    accuracy: s.accuracy,
    prev_accuracy: s.prev_accuracy,
  }));
}

export function typeAccuracyRows(types: TypeAccuracy[]): AccuracyRow[] {
  return types.map((t) => ({
    key: t.exercise_type,
    label: EXERCISE_TYPE_LABELS[t.exercise_type],
    attempts: t.attempts,
    accuracy: t.accuracy,
    prev_accuracy: t.prev_accuracy,
  }));
}

/** 0.873 → "87%". */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * "2026-10-01" → "01/10/2026"; a full timestamp ("2026-09-30T20:00:00+00:00") → its calendar day in `timeZone`
 * ("01/10/2026" in Asia/Ho_Chi_Minh). Anything unparseable is returned as-is.
 */
export function formatDay(isoish: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoish)) return formatDateVi(isoish);
  const instant = new Date(isoish);
  return Number.isNaN(instant.getTime()) ? isoish : formatDateVi(todayIso(timeZone, instant));
}

const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "2026-10-07" → "T4" (the calendar date itself, independent of the browser's zone). */
export function weekdayShort(isoDate: string): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split('-').map(Number);
  return WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

/** "2026-10-07" → "07/10". */
export function dayMonth(isoDate: string): string {
  const [, m = '', d = ''] = isoDate.split('-');
  return `${d}/${m}`;
}
