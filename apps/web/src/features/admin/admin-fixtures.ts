import type { AdminAuditEntry, AdminOverview, AdminReportGroup, AdminReportList, AdminSource } from '@linguo/shared';

// Test fixtures for the admin web core (spec 11 §4). They satisfy the shared zod contract.

export const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
export const REPORT_TARGET_A = '20000000-0000-4000-8000-000000000001';
export const REPORT_TARGET_B = '20000000-0000-4000-8000-000000000002';
export const REPORT_A1 = '30000000-0000-4000-8000-000000000001';
export const REPORT_A2 = '30000000-0000-4000-8000-000000000002';
export const REPORT_B1 = '30000000-0000-4000-8000-000000000003';

export function overviewFixture(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    counts: [
      { kind: 'lesson', language_code: 'en', status: 'published', count: 12 },
      { kind: 'lesson', language_code: 'en', status: 'draft', count: 3 },
      { kind: 'lesson', language_code: 'zh', status: 'published', count: 5 },
      { kind: 'exercise', language_code: 'en', status: 'published', count: 140 },
      { kind: 'exam_question', language_code: null, status: 'published', count: 40 },
    ],
    demo_count: 8,
    unreviewed_published_count: 4,
    open_report_count: 3,
    ...overrides,
  };
}

export function reportGroupFixture(overrides: Partial<AdminReportGroup> = {}): AdminReportGroup {
  return {
    target_kind: 'exercise',
    target_id: REPORT_TARGET_A,
    target_label: 'Chọn từ đúng: "I ___ a student"',
    report_count: 2,
    reasons: { wrong_answer: 2 },
    latest_at: '2026-10-13T08:00:00Z',
    reports: [
      { id: REPORT_A1, reason: 'wrong_answer', note: 'Đáp án phải là "am"', status: 'open', content_version: 2, created_at: '2026-10-13T08:00:00Z' },
      { id: REPORT_A2, reason: 'wrong_answer', note: null, status: 'open', content_version: 2, created_at: '2026-10-12T08:00:00Z' },
    ],
    ...overrides,
  };
}

export function reportListFixture(overrides: Partial<AdminReportList> = {}): AdminReportList {
  return {
    groups: [
      reportGroupFixture(),
      reportGroupFixture({
        target_kind: 'learning_item',
        target_id: REPORT_TARGET_B,
        target_label: 'apple',
        report_count: 1,
        reasons: { audio: 1 },
        latest_at: '2026-10-11T08:00:00Z',
        reports: [{ id: REPORT_B1, reason: 'audio', note: 'Không nghe được', status: 'open', content_version: 1, created_at: '2026-10-11T08:00:00Z' }],
      }),
    ],
    total_groups: 2,
    ...overrides,
  };
}

export function sourceFixture(overrides: Partial<AdminSource> = {}): AdminSource {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    key: 'tatoeba',
    name: 'Tatoeba',
    license: 'CC BY 2.0 FR',
    attribution: 'Câu ví dụ từ Tatoeba (tatoeba.org)',
    url: 'https://tatoeba.org',
    status: 'active',
    usage_count: 120,
    ...overrides,
  };
}

export function auditEntryFixture(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    actor: ADMIN_USER_ID,
    actor_role: 'admin',
    action: 'resolve_report',
    target_kind: 'content_report',
    target_id: REPORT_A1,
    detail: { status: 'fixed' },
    created_at: '2026-10-13T09:30:00Z',
    ...overrides,
  };
}
