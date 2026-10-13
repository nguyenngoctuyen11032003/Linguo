import { vi } from 'vitest';
import type { DiagnosticItem, DiagnosticProgress, DiagnosticReport } from '@linguo/shared';
import type { useDiagnosticRun } from '@/features/diagnostic/useDiagnosticRun';

export type DiagnosticRunApi = ReturnType<typeof useDiagnosticRun>;

export const PATH_ID = 'path-en';

export const ITEM: DiagnosticItem = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  skill: 'vocabulary',
  item_type: 'mcq',
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
};

export const READING_ITEM: DiagnosticItem = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
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
};

export const PROGRESS: DiagnosticProgress = {
  skills: [
    { skill: 'vocabulary', status: 'active', fill: 0.4 },
    { skill: 'grammar', status: 'pending', fill: 0 },
    { skill: 'reading', status: 'pending', fill: 0 },
  ],
  near_end: false,
};

export const REPORT: DiagnosticReport = {
  attempt_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  learning_path_id: PATH_ID,
  language_code: 'en',
  mode: 'full',
  completed_at: '2026-10-13T03:00:00Z',
  skills: [
    {
      skill: 'vocabulary',
      status: 'estimated',
      level_code: 'b1',
      range: { low: 'a2', high: 'b2' },
      confidence: 'high',
      sample_size: 7,
      reason: null,
    },
    {
      skill: 'grammar',
      status: 'estimated',
      level_code: 'b1',
      range: { low: 'b1', high: 'b1' },
      confidence: 'medium',
      sample_size: 6,
      reason: null,
    },
    {
      skill: 'reading',
      status: 'skipped',
      level_code: null,
      range: null,
      confidence: null,
      sample_size: 0,
      reason: 'no_time',
    },
    {
      skill: 'listening',
      status: 'not_supported',
      level_code: null,
      range: null,
      confidence: null,
      sample_size: 0,
      reason: null,
    },
    {
      skill: 'writing',
      status: 'not_supported',
      level_code: null,
      range: null,
      confidence: null,
      sample_size: 0,
      reason: null,
    },
    {
      skill: 'speaking',
      status: 'not_supported',
      level_code: null,
      range: null,
      confidence: null,
      sample_size: 0,
      reason: null,
    },
  ],
  current_level: 'a1',
  suggested_level: 'b1',
  capped_level: 'b1',
  early_stop: false,
  rapid_answer_share: 0,
  bank_unreviewed: true,
  applied_at: null,
  retake_after: '2026-10-27T03:00:00Z',
};

export function makeRun(overrides: Partial<DiagnosticRunApi> = {}): DiagnosticRunApi {
  return {
    status: 'question',
    mode: 'full',
    item: ITEM,
    progress: PROGRESS,
    error: null,
    start: vi.fn(),
    answer: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    finish: vi.fn(),
    report: null,
    accept: vi.fn().mockResolvedValue(null),
    retry: vi.fn(),
    ...overrides,
  };
}
