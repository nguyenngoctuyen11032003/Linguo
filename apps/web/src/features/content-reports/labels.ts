import type { ReportStatus, ReportTargetKind } from '@linguo/shared';

/** Learner-facing names of report statuses (Settings → "Báo lỗi của tôi"). */
export const REPORT_STATUS_LABELS_VI: Record<ReportStatus, string> = {
  open: 'Đang chờ xem',
  triaged: 'Đang xử lý',
  fixed: 'Đã sửa',
  rejected: 'Không cần sửa',
  duplicate: 'Trùng báo lỗi khác',
};

export const REPORT_TARGET_LABELS_VI: Record<ReportTargetKind, string> = {
  exercise: 'Bài tập',
  learning_item: 'Thẻ từ vựng',
  lesson: 'Bài học',
  assessment_item: 'Câu kiểm tra đầu vào',
  exam_question: 'Câu hỏi thi',
};
