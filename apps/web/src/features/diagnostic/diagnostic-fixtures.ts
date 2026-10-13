import type { DiagnosticItem, DiagnosticReport, DiagnosticStatus, DiagnosticStep, PlacementResult } from '@linguo/shared';

// Valid (zod-parseable) diagnostic payloads shared by the diagnostic unit tests.

export const PATH_ID = '30000000-0000-4000-8000-000000000001';
export const ATTEMPT_ID = '70000000-0000-4000-8000-000000000001';

export function diagItemId(n: number): string {
  return `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function diagItem(n: number, overrides: Partial<DiagnosticItem> = {}): DiagnosticItem {
  return {
    id: diagItemId(n),
    skill: 'vocabulary',
    item_type: 'mcq',
    prompt: {
      stem: `Question ${n}`,
      stem_lang: 'en',
      options: [
        { id: 'a', text: 'alpha', lang: 'en' },
        { id: 'b', text: 'beta', lang: 'en' },
        { id: 'c', text: 'gamma', lang: 'en' },
      ],
    },
    ...overrides,
  };
}

export function step(item: DiagnosticItem | null, overrides: Partial<DiagnosticStep> = {}): DiagnosticStep {
  return {
    attempt_id: ATTEMPT_ID,
    mode: 'full',
    item,
    progress: {
      skills: [
        { skill: 'vocabulary', status: 'active', fill: 0.2 },
        { skill: 'grammar', status: 'pending', fill: 0 },
        { skill: 'reading', status: 'pending', fill: 0 },
      ],
      near_end: false,
    },
    done: item === null,
    resumed: false,
    ...overrides,
  };
}

export function status(overrides: Partial<DiagnosticStatus> = {}): DiagnosticStatus {
  return {
    attempt_id: null,
    status: 'none',
    completed_at: null,
    applied_at: null,
    retake_after: null,
    can_start: true,
    ...overrides,
  };
}

export function report(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    attempt_id: ATTEMPT_ID,
    learning_path_id: PATH_ID,
    language_code: 'en',
    mode: 'full',
    completed_at: '2026-10-13T10:00:00Z',
    skills: [
      { skill: 'vocabulary', status: 'estimated', level_code: 'b1', range: { low: 'a2', high: 'b1' }, confidence: 'medium', sample_size: 8, reason: null },
      { skill: 'grammar', status: 'estimated', level_code: 'a2', range: { low: 'a2', high: 'b1' }, confidence: 'medium', sample_size: 8, reason: null },
      { skill: 'reading', status: 'skipped', level_code: null, range: null, confidence: null, sample_size: 0, reason: 'no_time' },
      { skill: 'listening', status: 'not_supported', level_code: null, range: null, confidence: null, sample_size: 0, reason: null },
      { skill: 'writing', status: 'not_supported', level_code: null, range: null, confidence: null, sample_size: 0, reason: null },
      { skill: 'speaking', status: 'not_supported', level_code: null, range: null, confidence: null, sample_size: 0, reason: null },
    ],
    current_level: 'a1',
    suggested_level: 'a2',
    capped_level: 'a2',
    early_stop: false,
    rapid_answer_share: 0,
    bank_unreviewed: true,
    applied_at: null,
    retake_after: '2026-10-27T10:00:00Z',
    ...overrides,
  };
}

export function placement(overrides: Partial<PlacementResult> = {}): PlacementResult {
  return {
    learning_path_id: PATH_ID,
    previous_level: 'a1',
    new_level: 'a2',
    outcome: 'applied',
    estimate: { weeks: 20 },
    ...overrides,
  };
}
