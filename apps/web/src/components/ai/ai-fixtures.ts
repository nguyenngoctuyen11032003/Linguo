import type { AiError, AiSuccess } from '@linguo/shared';

export const QUOTA = { used: 3, limit: 20, resets_at: '2026-10-13T17:00:00Z' };

export function aiSuccess(task: AiSuccess['task'], data: unknown, overrides: Partial<AiSuccess> = {}): AiSuccess {
  return { task, prompt_version: 'v1', data, cached: false, ai_generated: true, response_id: 'usage-1', quota: QUOTA, ...overrides };
}

export const EXPLAIN_DATA = {
  summary: 'Present perfect nối quá khứ với hiện tại.',
  explanation_md: 'Dùng **have/has + V3**.',
  examples: [{ target: 'I have lived here for two years.', vi: 'Tôi đã sống ở đây hai năm.' }],
  common_mistakes: ['Dùng với mốc thời gian quá khứ cụ thể.'],
  confidence: 'high',
  uncertainty: null,
};

export const ANALYZE_DATA = {
  verdict: 'incorrect',
  error_type: 'Chia động từ',
  explanation_md: 'Chủ ngữ số ít cần **has**.',
  corrected: 'She has finished.',
  tip_vi: 'Nhìn chủ ngữ trước khi chọn have/has.',
};

export const PRACTICE_DATA = {
  items: [
    { question: 'I ___ here since 2020.', options: ['live', 'have lived', 'lived'], answer: 'have lived', explanation_vi: 'Có "since" nên dùng present perfect.' },
    { question: 'She ___ to Paris last year.', options: ['has gone', 'went'], answer: 'went', explanation_vi: 'Mốc "last year" dùng quá khứ đơn.' },
  ],
};

export function aiError(error: AiError['error'], overrides: Partial<AiError> = {}): AiError {
  return { error, message: 'x', retry_after_sec: null, quota: null, ...overrides };
}
