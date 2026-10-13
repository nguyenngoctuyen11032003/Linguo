import { vi } from 'vitest';
import type { DiagnosticItem, DiagnosticProgress, DiagnosticReport } from '@linguo/shared';
import { ATTEMPT_ID, diagItem, report, step } from '@/features/diagnostic/diagnostic-fixtures';
import type { DiagnosticRunApi } from '@/features/diagnostic/useDiagnosticRun';

export type { DiagnosticRunApi };

/** Same id as TEST_PATH in tests/unit/learning-fixtures.ts, so the page finds the path's language and target. */
export const PATH_ID = 'path-en';

export const ITEM: DiagnosticItem = diagItem(1, {
  prompt: {
    stem: 'Chọn từ có nghĩa là “quả táo”.',
    stem_lang: 'vi',
    passage: null,
    options: [
      { id: 'a', text: 'apple', lang: 'en' },
      { id: 'b', text: 'orange', lang: 'en' },
      { id: 'c', text: 'table', lang: 'en' },
    ],
  },
});

export const READING_ITEM: DiagnosticItem = diagItem(2, {
  skill: 'reading',
  item_type: 'reading_mcq',
  prompt: {
    stem: 'Where does Tom work?',
    stem_lang: 'en',
    passage: 'Tom is a nurse. He works at a hospital near his house.',
    options: [
      { id: 'a', text: 'At a school', lang: 'en' },
      { id: 'b', text: 'At a hospital', lang: 'en' },
    ],
  },
});

export const PROGRESS: DiagnosticProgress = {
  ...step(ITEM).progress,
  skills: [
    { skill: 'vocabulary', status: 'active', fill: 0.4 },
    { skill: 'grammar', status: 'pending', fill: 0 },
    { skill: 'reading', status: 'pending', fill: 0 },
  ],
};

const base = report();

export const REPORT: DiagnosticReport = report({
  learning_path_id: PATH_ID,
  skills: base.skills.map((row) => {
    if (row.skill === 'vocabulary')
      return { ...row, level_code: 'b1', range: { low: 'a2', high: 'b2' }, confidence: 'high', sample_size: 7 };
    if (row.skill === 'grammar')
      return { ...row, level_code: 'b1', range: { low: 'b1', high: 'b1' }, confidence: 'medium', sample_size: 6 };
    return row;
  }),
  suggested_level: 'b1',
  capped_level: 'b1',
  retake_after: '2026-10-27T03:00:00Z',
});

export function makeRun(overrides: Partial<DiagnosticRunApi> = {}): DiagnosticRunApi {
  return {
    status: 'question',
    mode: 'full',
    attemptId: ATTEMPT_ID,
    item: ITEM,
    progress: PROGRESS,
    error: null,
    resumable: true,
    retakeAfter: null,
    report: null,
    start: vi.fn(),
    answer: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    finish: vi.fn(),
    accept: vi.fn().mockResolvedValue(null),
    retry: vi.fn(),
    ...overrides,
  };
}
