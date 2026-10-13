import type { AI_REPORT_REASONS } from '@linguo/shared';

export type AiReportReasonId = (typeof AI_REPORT_REASONS)[number];

export const AI_REPORT_REASON_LABELS: Record<AiReportReasonId, string> = {
  wrong: 'Sai kiến thức',
  unclear: 'Khó hiểu',
  unsafe: 'Không phù hợp / không an toàn',
  other: 'Lý do khác',
};
