import type { Database } from '@linguo/shared';
import fixtures from '../../../../packages/shared/src/learning/estimate.fixtures.json';
import { toLearningPath, type ReferenceHoursByLanguage } from '@/features/learning-paths/service';
// Same id as TEST_USER_ID in render.tsx (kept literal to avoid a circular import).
const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

type PathRow = Database['public']['Tables']['learning_paths']['Row'];

export const REFERENCE: ReferenceHoursByLanguage = {
  en: fixtures.referenceHours.en.map((r) => ({ ...r, reviewed: false })),
  ko: fixtures.referenceHours.ko.map((r) => ({ ...r, reviewed: false })),
  ja: fixtures.referenceHours.ja.map((r) => ({ ...r, reviewed: false })),
};

export const ESTIMATE_RECORD = {
  hours_needed: 185,
  weeks_min: 43,
  weeks_mid: 53,
  weeks_max: 69,
  feasibility: 'no_deadline',
  suggested_minutes_per_day: null,
  suggested_date: null,
  assumptions: { weekly_minutes: 210, hours_needed: 185, reference_reviewed: false, multiplier_range: [0.8, 1.3] },
};

export function pathRow(overrides: Partial<PathRow> = {}): PathRow {
  return {
    id: 'path-en',
    user_id: TEST_USER_ID,
    language_code: 'en',
    start_point: 'some',
    goal_type: 'daily_communication',
    current_level: 'a2',
    target_level: 'b1',
    weekly_minutes: [30, 30, 30, 30, 30, 30, 30],
    target_date: null,
    status: 'active',
    estimate: ESTIMATE_RECORD,
    created_at: '2026-10-13T01:00:00Z',
    updated_at: '2026-10-13T01:00:00Z',
    ...overrides,
  };
}

export const TEST_PATH = toLearningPath(pathRow());
export const TEST_KO_PATH = toLearningPath(
  pathRow({
    id: 'path-ko',
    language_code: 'ko',
    goal_type: 'hangul_basics',
    current_level: 'hangul',
    target_level: 'topik1',
    weekly_minutes: [15, 15, 15, 15, 15, 15, 15],
    estimate: { ...ESTIMATE_RECORD, hours_needed: 120, weeks_min: 55, weeks_mid: 69, weeks_max: 90 },
  }),
);
