import type { MyReport, ReportContentResult } from '@linguo/shared';

export const REPORT_EXERCISE_ID = '30000000-0000-4000-8000-000000000001';
export const REPORT_ITEM_ID = '30000000-0000-4000-8000-000000000002';
export const REPORT_ID = '30000000-0000-4000-8000-0000000000aa';

export function reportResultFixture(overrides: Partial<ReportContentResult> = {}): ReportContentResult {
  return { report_id: REPORT_ID, status: 'open', ...overrides };
}

export function myReportFixture(overrides: Partial<MyReport> = {}): MyReport {
  return {
    id: REPORT_ID,
    target_kind: 'exercise',
    target_id: REPORT_EXERCISE_ID,
    target_label: 'Dịch: Tôi là học sinh.',
    reason: 'wrong_answer',
    note: null,
    status: 'open',
    resolution_note: null,
    created_at: '2026-10-12T03:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}
