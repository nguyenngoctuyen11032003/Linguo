import { LEVEL_INFO, type DiagnosticConfidence, type DiagnosticReport, type ReportSkill } from '@linguo/shared';
import type { SkipReason } from '@/features/diagnostic/service';

export type { SkipReason };
type ReportSkillRow = DiagnosticReport['skills'][number];

/** `/app/kiem-tra/:pathId?che-do=nen-tang` starts a foundation-mode attempt (2–3 minutes); a resumed attempt keeps its mode. */
export const MODE_PARAM = 'che-do';
export const FOUNDATION_MODE_VALUE = 'nen-tang';

/** "27/10/2026" (vi-VN); unparseable input is returned as-is. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export const SKILL_LABELS: Record<ReportSkill, string> = {
  vocabulary: 'Từ vựng',
  grammar: 'Ngữ pháp',
  reading: 'Đọc hiểu',
  listening: 'Nghe',
  writing: 'Viết',
  speaking: 'Nói',
};

export const CONFIDENCE_LABELS: Record<DiagnosticConfidence, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  no_time: 'Tôi không có đủ thời gian',
  too_hard: 'Phần này quá khó với tôi',
  not_my_goal: 'Kỹ năng này không phải mục tiêu của tôi',
  other: 'Lý do khác',
};

/** Display label of a level code ("a2" → "A2", "topik1" → "TOPIK 1"); unknown codes are shown as-is. */
export function levelLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return (LEVEL_INFO as Record<string, { label: string } | undefined>)[code]?.label ?? code;
}

/** "A1–B1", or a single label when both ends are the same level. */
export function rangeLabel(range: { low: string; high: string } | null): string | null {
  if (!range) return null;
  return range.low === range.high ? levelLabel(range.low) : `${levelLabel(range.low)}–${levelLabel(range.high)}`;
}

const SHORT_SKIP_REASONS: Record<SkipReason, string> = {
  no_time: 'không đủ thời gian',
  too_hard: 'quá khó',
  not_my_goal: 'không phải mục tiêu',
  other: 'lý do khác',
};

/** Why a skill has no estimate, in plain Vietnamese. */
export function missingReason(row: ReportSkillRow): string {
  switch (row.status) {
    case 'skipped': {
      const reason = row.reason && row.reason in SHORT_SKIP_REASONS ? SHORT_SKIP_REASONS[row.reason as SkipReason] : null;
      return reason ? `Bạn đã bỏ qua kỹ năng này (${reason}).` : 'Bạn đã bỏ qua kỹ năng này.';
    }
    case 'not_supported':
      return row.skill === 'listening' ? 'Bài kiểm tra chưa có phần nghe.' : 'Bài trắc nghiệm không đánh giá được kỹ năng này.';
    case 'insufficient':
      return row.sample_size > 0 ? 'Số câu đã trả lời chưa đủ để ước lượng đáng tin.' : 'Bạn chưa trả lời câu nào của kỹ năng này.';
    default:
      return '';
  }
}
